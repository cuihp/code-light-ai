use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const BLINK_INTERVAL: Duration = Duration::from_millis(500);
const SESSION_STALE_SECS: u64 = 300;
const WAITING_TIMEOUT_SECS: u64 = 30;
const WORKING_STALE_SECS: u64 = 60;
const COMPLETED_DISPLAY_SECS: u64 = 10;


#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
enum State {
    Idle = 0,
    Completed = 1,
    Working = 2,
    Waiting = 3,
    Error = 4,
}

impl State {
    fn from_str(s: &str) -> Self {
        match s {
            "working" => State::Working,
            "waiting" => State::Waiting,
            "error" => State::Error,
            "completed" => State::Completed,
            _ => State::Idle,
        }
    }

    fn key(self) -> &'static str {
        match self {
            State::Working => "working",
            State::Waiting => "waiting",
            State::Error => "error",
            State::Completed => "completed",
            State::Idle => "idle",
        }
    }
}

#[derive(Deserialize)]
struct SessionData {
    state: String,
    #[allow(dead_code)]
    message: Option<String>,
    timestamp: Option<u64>,
}

struct AppState {
    state: State,
    message: String,
    timestamp: u64,
    active_count: usize,
    blink_on: bool,
    completed_since: Option<u64>,
}

fn sessions_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".code-light")
        .join("sessions")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn load_png(path: &std::path::Path) -> Image<'static> {
    let data = fs::read(path).unwrap_or_else(|e| panic!("Failed to load {}: {}", path.display(), e));
    let img = image::load_from_memory(&data)
        .unwrap_or_else(|e| panic!("Failed to decode {}: {}", path.display(), e));
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    Image::new_owned(rgba.into_raw(), w, h)
}

fn make_empty_icon() -> Image<'static> {
    let size = 64u32;
    let rgba = vec![0u8; (size * size * 4) as usize];
    Image::new_owned(rgba, size, size)
}

fn build_icons() -> HashMap<String, Image<'static>> {
    let icon_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/status");
    let color_map = [
        ("idle", "gray.png"),
        ("working", "green.png"),
        ("waiting", "yellow.png"),
        ("error", "red.png"),
        ("completed", "blue.png"),
    ];
    let mut map = HashMap::new();
    for (key, file) in color_map {
        map.insert(key.to_string(), load_png(&icon_dir.join(file)));
    }
    map.insert("off".to_string(), make_empty_icon());
    map
}

fn read_all_sessions() -> (State, String, u64, usize) {
    let now = now_secs();
    let dir = sessions_dir();
    let _ = fs::create_dir_all(&dir);

    let Ok(entries) = fs::read_dir(&dir) else {
        return (State::Idle, String::new(), 0, 0);
    };

    let mut best_state = State::Idle;
    let mut best_message = String::new();
    let mut best_ts: u64 = 0;
    let mut active_count: usize = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let mtime = modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if now.saturating_sub(mtime) > SESSION_STALE_SECS {
            let _ = fs::remove_file(&path);
            continue;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(data) = serde_json::from_str::<SessionData>(&content) else {
            continue;
        };

        let mut state = State::from_str(&data.state);

        if state == State::Waiting && now.saturating_sub(mtime) > WAITING_TIMEOUT_SECS {
            state = State::Working;
        }

        if state == State::Working && now.saturating_sub(mtime) > WORKING_STALE_SECS {
            state = State::Completed;
            if let Ok(mut f) = fs::File::create(&path) {
                let updated = serde_json::json!({
                    "state": "completed",
                    "message": "Auto-completed (stop hook missing)",
                    "timestamp": now
                });
                let _ = serde_json::to_writer(&mut f, &updated);
            }
        }

        active_count += 1;
        if state > best_state {
            best_state = state;
            best_message = data.message.unwrap_or_default();
            best_ts = data.timestamp.unwrap_or(0);
        }
    }

    (best_state, best_message, best_ts, active_count)
}

fn format_time(ts: u64) -> String {
    if ts == 0 {
        return String::new();
    }
    let delta = now_secs().saturating_sub(ts);
    if delta < 60 {
        format!("{}s ago", delta)
    } else if delta < 3600 {
        format!("{}m ago", delta / 60)
    } else {
        format!("{}h ago", delta / 3600)
    }
}

fn build_status_text(state: State, message: &str, ts: u64, count: usize) -> String {
    let label = match state {
        State::Working => "Working",
        State::Waiting => "Waiting for confirmation",
        State::Error => "Error",
        State::Completed => "Task completed",
        State::Idle => "Idle",
    };
    let mut parts = vec![format!("code-light: {}", label)];
    if count > 1 {
        parts.push(format!("({} sessions)", count));
    }
    if !message.is_empty() {
        parts.push(message.to_string());
    }
    let time_str = format_time(ts);
    if !time_str.is_empty() {
        parts.push(time_str);
    }
    parts.join(" | ")
}

fn cleanup_completed_sessions() {
    let dir = sessions_dir();
    let Ok(entries) = fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(data) = serde_json::from_str::<SessionData>(&content) {
                if data.state == "completed" {
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }
}

fn get_hooks_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let bundled = parent.join("hooks");
            if bundled.is_dir() {
                return bundled;
            }

            let search_paths: &[&str] = if cfg!(target_os = "macos") {
                &["../Resources/hooks", "../Resources/_up_/hooks"]
            } else if cfg!(target_os = "linux") {
                &["../lib/code-light/hooks", "../resources/hooks"]
            } else {
                &["../resources/hooks"]
            };

            for rel in search_paths {
                if let Some(resolved) = parent.join(rel).canonicalize().ok() {
                    if resolved.is_dir() {
                        return resolved;
                    }
                }
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("hooks")
}

fn shell_command(hooks_dir: &std::path::Path, script: &str) -> String {
    let script_path = hooks_dir.join(script);
    let path = script_path.display().to_string();
    if cfg!(target_os = "windows") {
        let path = path.replace('\\', "/");
        format!("bash '{}'", path)
    } else {
        format!("bash '{}'", path)
    }
}

fn base_hooks_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".code-light")
        .join("hooks")
}

fn claude_local_hooks_dir() -> PathBuf {
    base_hooks_dir().join("claude")
}

fn codex_local_hooks_dir() -> PathBuf {
    base_hooks_dir().join("codex")
}

fn copy_hooks_to_local(src: &std::path::Path, dest: &std::path::Path) {
    let _ = fs::create_dir_all(dest);
    if let Ok(entries) = fs::read_dir(src) {
        for entry in entries.flatten() {
            let src_path = entry.path();
            if src_path.is_file() {
                let dest_path = dest.join(entry.file_name());
                let _ = fs::copy(&src_path, &dest_path);
            }
        }
    }
}

fn setup_hooks() {
    let settings_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".claude")
        .join("settings.json");

    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::Value::Object(Default::default()))
    } else {
        serde_json::Value::Object(Default::default())
    };

    let bundled_claude = get_hooks_dir().join("claude");
    let claude_dest = claude_local_hooks_dir();
    copy_hooks_to_local(&bundled_claude, &claude_dest);

    let hook_defs = serde_json::json!({
        "PreToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&claude_dest, "pre-tool-use.sh") }] }],
        "PostToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&claude_dest, "post-tool-use.sh") }] }],
        "PostToolUseFailure": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&claude_dest, "post-tool-use-failure.sh") }] }],
        "Notification": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&claude_dest, "notification.sh") }] }],
        "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&claude_dest, "stop.sh") }] }],
    });

    if let Some(hooks) = hook_defs.as_object() {
        let settings_hooks = settings
            .as_object_mut()
            .unwrap()
            .entry("hooks")
            .or_insert_with(|| serde_json::Value::Object(Default::default()));

        for (event, defs) in hooks {
            settings_hooks
                .as_object_mut()
                .unwrap()
                .insert(event.clone(), defs.clone());
        }
    }

    if let Ok(content) = serde_json::to_string_pretty(&settings) {
        let _ = fs::write(&settings_path, content);
    }

    let _ = fs::create_dir_all(sessions_dir());
}

fn setup_codex_hooks() {
    let codex_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".codex");

    let hooks_json_path = codex_dir.join("hooks.json");

    let mut codex_config: serde_json::Value = if hooks_json_path.exists() {
        let content = fs::read_to_string(&hooks_json_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::Value::Object(Default::default()))
    } else {
        serde_json::Value::Object(Default::default())
    };

    let bundled_codex = get_hooks_dir().join("codex");
    let codex_dest = codex_local_hooks_dir();
    copy_hooks_to_local(&bundled_codex, &codex_dest);

    let hook_defs = serde_json::json!({
        "SessionStart": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&codex_dest, "session_start.sh"), "statusMessage": "Code Light: Session tracking" }] }],
        "PreToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&codex_dest, "pre_tool_use.sh"), "statusMessage": "Code Light: Tracking" }] }],
        "PermissionRequest": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&codex_dest, "permission_request.sh"), "statusMessage": "Code Light: Waiting for approval" }] }],
        "PostToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": shell_command(&codex_dest, "post_tool_use.sh") }] }],
        "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": shell_command(&codex_dest, "user_prompt_submit.sh") }] }],
        "Stop": [{ "hooks": [{ "type": "command", "command": shell_command(&codex_dest, "stop.sh"), "timeout": 30 }] }],
    });

    let config_hooks = codex_config
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| serde_json::Value::Object(Default::default()));

    for (event, defs) in hook_defs.as_object().unwrap() {
        config_hooks
            .as_object_mut()
            .unwrap()
            .insert(event.clone(), defs.clone());
    }

    let _ = fs::create_dir_all(&codex_dir);
    if let Ok(content) = serde_json::to_string_pretty(&codex_config) {
        let _ = fs::write(&hooks_json_path, content);
    }

    let _ = fs::create_dir_all(sessions_dir());
}

#[cfg(target_os = "macos")]
fn make_window_transparent(window: &tauri::WebviewWindow) {
    use objc::runtime::{Class, Object, NO};
    use objc::{msg_send, sel, sel_impl};
    if let Ok(ptr) = window.ns_window() {
        unsafe {
            let ns_window = ptr as *mut Object;
            let clear: *mut Object =
                msg_send![Class::get("NSColor").unwrap(), clearColor];
            let _: () = msg_send![ns_window, setOpaque: NO];
            let _: () = msg_send![ns_window, setBackgroundColor: clear];
        }
    }
}

#[tauri::command]
fn get_current_state(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> serde_json::Value {
    let s = state.lock().unwrap();
    serde_json::json!({
        "state": s.state.key(),
        "message": s.message,
        "timestamp": s.timestamp,
        "activeCount": s.active_count,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let icons = Arc::new(Mutex::new(build_icons()));

    let app_state = Arc::new(Mutex::new(AppState {
        state: State::Idle,
        message: String::new(),
        timestamp: 0,
        active_count: 0,
        blink_on: true,
        completed_since: None,
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![get_current_state])
        .setup(move |app| {
            let initial_icon = icons.lock().unwrap().get("idle").unwrap().clone();

            let toggle_pet_item = MenuItemBuilder::with_id("toggle_pet", "Hide Pet").build(app)?;
            let whip_item = MenuItemBuilder::with_id("whip", "Whip").build(app)?;
            let setup_claude_item = MenuItemBuilder::with_id("setup_claude", "Setup Claude Hooks").build(app)?;
            let setup_codex_item = MenuItemBuilder::with_id("setup_codex", "Setup Codex Hooks").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Code Light").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&toggle_pet_item)
                .item(&whip_item)
                .separator()
                .item(&setup_claude_item)
                .item(&setup_codex_item)
                .separator()
                .item(&quit_item)
                .build()?;

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let toggle_item = toggle_pet_item.clone();
            let _tray = TrayIconBuilder::with_id("main")
                .icon(initial_icon)
                .menu(&menu)
                .tooltip("code-light: Idle")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "toggle_pet" => {
                        if let Some(window) = app.get_webview_window("pet") {
                            if let Ok(visible) = window.is_visible() {
                                if visible {
                                    let _ = window.hide();
                                    let _ = toggle_item.set_text("Show Pet");
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let _ = toggle_item.set_text("Hide Pet");
                                }
                            }
                        }
                    }
                    "whip" => {
                        let _ = app.emit("whip", ());
                    }
                    "setup_claude" => {
                        setup_hooks();
                        if let Some(tray) = app.tray_by_id("main") {
                            let _ = tray.set_tooltip(Some("code-light: Claude hooks configured!"));
                        }
                    }
                    "setup_codex" => {
                        setup_codex_hooks();
                        if let Some(tray) = app.tray_by_id("main") {
                            let _ = tray.set_tooltip(Some("code-light: Codex hooks configured!"));
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, event| {
                    let _ = event;
                })
                .build(app)?;

            // Make pet window transparent on macOS
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("pet") {
                make_window_transparent(&window);
            }

            // Register global shortcut: Cmd+B (macOS) / Ctrl+B (others) → whip
            let shortcut_app = app.handle().clone();
            app.global_shortcut().on_shortcut("CmdOrCtrl+B", move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = shortcut_app.emit("whip", ());
                }
            }).ok();

            // Poll thread
            let poll_app = app.handle().clone();
            let poll_state = app_state.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(POLL_INTERVAL);
                    let (state, message, ts, count) = read_all_sessions();
                    let mut s = poll_state.lock().unwrap();

                    if s.state == State::Completed {
                        if let Some(since) = s.completed_since {
                            if now_secs() - since > COMPLETED_DISPLAY_SECS {
                                s.state = State::Idle;
                                s.completed_since = None;
                                drop(s);
                                cleanup_completed_sessions();
                                s = poll_state.lock().unwrap();
                            }
                        }
                    }

                    if state != s.state {
                        s.state = state;
                        s.message = message;
                        s.timestamp = ts;
                        s.active_count = count;
                        s.blink_on = true;
                        s.completed_since = if state == State::Completed {
                            Some(now_secs())
                        } else {
                            None
                        };

                        let payload = serde_json::json!({
                            "state": s.state.key(),
                            "message": s.message,
                            "timestamp": s.timestamp,
                            "activeCount": s.active_count,
                        });
                        let _ = poll_app.emit("state-changed", payload);
                    } else if ts != s.timestamp || count != s.active_count {
                        s.message = message;
                        s.timestamp = ts;
                        s.active_count = count;
                    }

                    let text =
                        build_status_text(s.state, &s.message, s.timestamp, s.active_count);
                    if let Some(tray) = poll_app.tray_by_id("main") {
                        let _ = tray.set_tooltip(Some(&text));
                    }
                }
            });

            // Blink thread
            let blink_app = app.handle().clone();
            let blink_state = app_state.clone();
            let blink_icons = icons.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(BLINK_INTERVAL);
                let mut s = blink_state.lock().unwrap();

                let key = match s.state {
                    State::Working | State::Waiting | State::Error => {
                        s.blink_on = !s.blink_on;
                        if s.blink_on {
                            s.state.key().to_string()
                        } else {
                            "off".to_string()
                        }
                    }
                    _ => s.state.key().to_string(),
                };

                let icon = blink_icons.lock().unwrap().get(&key).unwrap().clone();
                if let Some(tray) = blink_app.tray_by_id("main") {
                    let _ = tray.set_icon(Some(icon));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
