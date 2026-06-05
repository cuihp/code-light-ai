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

# Escape string for safe JSON embedding
json_escape() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

# Extract a string field value from JSON input
extract_field() {
    local input="$1"
    local field="$2"
    printf '%s' "$input" | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*:.*"\(.*\)"/\1/'
}

# Build descriptive message from tool context
make_message() {
    local tool_name="$1"
    local file_path="${2:-}"
    local command="${3:-}"

    case "$tool_name" in
        Read|read_file)
            [ -n "$file_path" ] && printf 'Reading %s' "$(basename "$file_path")" && return
            ;;
        Edit|edit_file|Write|write_file)
            [ -n "$file_path" ] && printf 'Editing %s' "$(basename "$file_path")" && return
            ;;
        Bash|shell)
            [ -n "$command" ] && printf 'Running: %s' "${command:0:60}" && return
            ;;
        *)
            ;;
    esac
    [ -n "$tool_name" ] && printf 'Using %s' "$tool_name"
}

# Write session data only if current state is NOT completed
# Args: session_id state [message] [tool_name] [file_path] [command]
write_state_unless_done() {
    local session_id="$1"
    local state="$2"
    local message="${3:-}"
    local tool_name="${4:-}"
    local file_path="${5:-}"
    local command="${6:-}"

    ensure_dir
    local sf
    sf="$(session_file "$session_id")"

    # Don't overwrite completed state
    local current=""
    if [ -f "$sf" ]; then
        current=$(grep -o '"state":"[^"]*"' "$sf" 2>/dev/null | head -1 | cut -d'"' -f4)
    fi
    if [ "$current" = "completed" ]; then
        return
    fi

    local ts="$(date +%s)"
    local cwd=$(json_escape "${PWD:-}")
    local project=$(json_escape "$(basename "${PWD:-}")")

    # Build JSON object
    local json="{"
    json="${json}\"state\":\"${state}\""
    json="${json},\"message\":\"$(json_escape "$message")\""
    json="${json},\"timestamp\":${ts}"
    json="${json},\"session_id\":\"$(json_escape "$session_id")\""
    [ -n "$tool_name" ] && json="${json},\"tool_name\":\"$(json_escape "$tool_name")\""
    [ -n "$file_path" ] && json="${json},\"file_path\":\"$(json_escape "$file_path")\""
    [ -n "$command" ] && json="${json},\"command\":\"$(json_escape "$command")\""
    json="${json},\"cwd\":\"${cwd}\""
    json="${json},\"project\":\"${project}\""
    json="${json},\"agent\":\"codex\""
    json="${json}}"

    _atomic_write "$sf" "$json"
}
