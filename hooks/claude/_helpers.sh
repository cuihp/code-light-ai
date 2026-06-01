#!/bin/bash
# Shared helper for code-light hooks

CODE_LIGHT_DIR="$HOME/.code-light"
SESSIONS_DIR="$CODE_LIGHT_DIR/sessions"

# Use stable session ID from environment
get_session_id() {
    echo "${CLAUDE_CODE_SESSION_ID:-unknown}"
}

ensure_dir() {
    mkdir -p "$SESSIONS_DIR"
}

session_file() {
    echo "$SESSIONS_DIR/$(get_session_id).json"
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
write_state_unless_done() {
    local state="$1"
    local message="${2:-}"
    ensure_dir
    local sf="$(session_file)"
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
