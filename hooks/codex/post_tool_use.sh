#!/bin/bash
source "$(dirname "$0")/_helpers.sh"

INPUT=$(cat)
SESSION_ID=$(get_session_id_from_input "$INPUT")

tool_name=$(extract_field "$INPUT" "tool_name")
file_path=$(extract_field "$INPUT" "file_path")
command=$(extract_field "$INPUT" "command")
message=$(make_message "$tool_name" "$file_path" "$command")

[ -n "$SESSION_ID" ] && write_state_unless_done "$SESSION_ID" "working" "$message" "$tool_name" "$file_path" "$command"
