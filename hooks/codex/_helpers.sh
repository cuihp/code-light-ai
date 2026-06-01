#!/bin/bash
# Shared helper for code-light Codex hooks

CODE_LIGHT_DIR="$HOME/.code-light"
SESSIONS_DIR="$CODE_LIGHT_DIR/sessions"

# Extract session_id from JSON input (handles optional whitespace)
get_session_id_from_input() {
    local input="$1"
    echo "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

ensure_dir() {
    mkdir -p "$SESSIONS_DIR"
}

session_file() {
    echo "$SESSIONS_DIR/$1.json"
}

# Atomic write
_atomic_write() {
    local target="$1"
    local content="$2"
    local tmp="${target}.tmp.$$"
    printf '%s' "$content" > "$tmp"
    mv "$tmp" "$target"
}

# Write state only if current state is NOT completed
# Args: session_id state message
write_state_unless_done() {
    local session_id="$1"
    local state="$2"
    local message="${3:-}"
    ensure_dir
    local sf
    sf="$(session_file "$session_id")"
    local current=""
    if [ -f "$sf" ]; then
        current=$(grep -o '"state":"[^"]*"' "$sf" 2>/dev/null | head -1 | cut -d'"' -f4)
    fi
    if [ "$current" != "completed" ]; then
        local content
        content=$(printf '{"state":"%s","message":"%s","timestamp":%d}' \
            "$state" "$message" "$(date +%s)")
        _atomic_write "$sf" "$content"
    fi
}
