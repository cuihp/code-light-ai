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
    local query="${4:-}"

    case "$tool_name" in
        Read)
            [ -n "$file_path" ] && printf 'Reading %s' "$(basename "$file_path")" && return
            ;;
        Edit)
            [ -n "$file_path" ] && printf 'Editing %s' "$(basename "$file_path")" && return
            ;;
        Write)
            [ -n "$file_path" ] && printf 'Writing %s' "$(basename "$file_path")" && return
            ;;
        NotebookEdit)
            [ -n "$file_path" ] && printf 'Editing notebook %s' "$(basename "$file_path")" && return
            ;;
        Bash)
            [ -n "$command" ] && printf 'Running: %s' "${command:0:60}" && return
            ;;
        WebSearch)
            [ -n "$query" ] && printf 'Searching: %s' "${query:0:60}" && return
            ;;
        Agent)
            [ -n "$file_path" ] && printf 'Agent: %s' "$file_path" && return
            ;;
        AskUserQuestion)
            printf 'Waiting for user input' && return
            ;;
        *)
            ;;
    esac
    [ -n "$tool_name" ] && printf 'Using %s' "$tool_name"
}

# Write session data only if current state is NOT completed
# Args: state [message] [tool_name] [file_path] [command] [query]
write_state_unless_done() {
    local state="$1"
    local message="${2:-}"
    local tool_name="${3:-}"
    local file_path="${4:-}"
    local command="${5:-}"
    local query="${6:-}"

    ensure_dir
    local sf="$(session_file)"

    # Don't overwrite completed state
    local current=""
    if [ -f "$sf" ]; then
        current=$(grep -o '"state":"[^"]*"' "$sf" 2>/dev/null | head -1 | cut -d'"' -f4)
    fi
    if [ "$current" = "completed" ]; then
        return
    fi

    local session_id="$(get_session_id)"
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
    [ -n "$query" ] && json="${json},\"query\":\"$(json_escape "$query")\""
    json="${json},\"cwd\":\"${cwd}\""
    json="${json},\"project\":\"${project}\""
    json="${json},\"agent\":\"claude\""
    json="${json}}"

    _atomic_write "$sf" "$json"
}
