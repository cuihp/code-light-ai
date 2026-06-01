# Code Light AI

[中文文档](./README_CN.md)

A system tray status light for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It shows a colored indicator in your system tray so you can tell at a glance what your AI coding agent is doing — without keeping the terminal visible.

## Status Indicators

| Color | State | Description |
|:---:|---|---|
| Gray | Idle | No active Claude Code sessions |
| Green (blinking) | Working | Agent is executing tool calls |
| Yellow (blinking) | Waiting | Agent is waiting for user confirmation |
| Red (blinking) | Error | An error has occurred |
| Blue | Completed | Task finished (displays for 10 seconds, then returns to idle) |

Active states blink every 500ms to catch your attention. The tray tooltip shows the current state, active session count, and last update time.

## How It Works

Code Light uses a file-based polling mechanism:

1. **Shell hooks** are registered as Claude Code lifecycle hooks (via `~/.claude/settings.json`)
2. Each hook writes a JSON state file to `~/.code-light/sessions/<session-id>.json`
3. The tray app polls these files every second and updates the icon

```
Claude Code event → Hook script → ~/.code-light/sessions/*.json → Tray icon
```

Zero network ports, zero APIs, zero configuration — just files on disk.

## Install

### Prerequisites

- macOS 12+ / Linux / Windows 10+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- Node.js 18+ and [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) toolchain
- Windows users need [Git for Windows](https://git-scm.com/) (provides bash)

### Build from source

```bash
git clone https://github.com/cuihuapeng/code-light-ai.git
cd code-light-ai
pnpm install
pnpm tauri build
```

Built artifacts:

| Platform | Location |
|----------|----------|
| macOS | `src-tauri/target/release/bundle/macos/code-light.app` |
| Linux | `src-tauri/target/release/bundle/deb/code-light_*.deb` |
| Windows | `src-tauri/target/release/bundle/nsis/code-light_*.exe` |

## Usage

1. **Launch** Code Light — a gray dot appears in your system tray
2. **Click** the icon and select **"Setup Hooks"** — this registers the hook scripts in `~/.claude/settings.json`
3. **Start Claude Code** in your terminal — the tray icon changes color as the agent works

That's it. On macOS the app runs as a pure menu bar accessory with no dock icon.

### macOS: "App is damaged" or "cannot be opened" error

If you build from source or download an unsigned build, macOS may block the app. To fix this:

```bash
xattr -cr /path/to/code-light.app
```

Then open it by **right-clicking** the app and selecting **Open** → **Open** again in the dialog. You only need to do this once.

### Multi-session support

If you run multiple Claude Code sessions in different terminals, Code Light tracks all of them simultaneously. The icon reflects the highest-priority state across all active sessions (Error > Waiting > Working > Completed > Idle).

### Automatic cleanup

- Sessions with no activity for 5 minutes are automatically removed
- Sessions stuck in "waiting" for 30+ seconds are promoted to "working"
- Sessions stuck in "working" for 60+ seconds are auto-completed
- Completed sessions are cleaned up after the 10-second display window

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build

# Lint Rust code
cd src-tauri && cargo clippy
```

## Project Structure

```
code-light/
├── hooks/                          # Claude Code hook scripts
│   ├── _helpers.sh                 # Shared functions (session ID, atomic write, state management)
│   ├── pre-tool-use.sh             # Sets state to "working"
│   ├── post-tool-use.sh            # Placeholder for state resets
│   ├── post-tool-use-failure.sh    # Sets state to "error"
│   ├── notification.sh             # Sets state to "waiting" on permission prompts
│   └── stop.sh                     # Sets state to "completed"
├── src-tauri/                      # Tauri v2 / Rust backend
│   ├── src/
│   │   ├── main.rs                 # Entry point
│   │   └── lib.rs                  # Tray icon, polling, blink, hook setup
│   ├── icons/status/               # Status indicator PNGs (gray, green, yellow, red, blue)
│   └── tauri.conf.json             # Tauri configuration
├── src/                            # Frontend (vestigial — no visible window)
├── package.json
└── vite.config.ts
```

## Tech Stack

- **Backend:** [Tauri v2](https://v2.tauri.app/) + Rust
- **Frontend:** Vite + TypeScript (minimal — the app has no visible window)
- **Hooks:** Bash scripts registered as Claude Code lifecycle hooks

## License

MIT
