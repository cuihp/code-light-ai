#!/bin/bash
source "$(dirname "$0")/_helpers.sh"

INPUT=$(cat)

tool_name=$(extract_field "$INPUT" "tool_name")
file_path=$(extract_field "$INPUT" "file_path")
message="Tool execution failed"
[ -n "$tool_name" ] && message="${tool_name} failed"

write_state_unless_done "error" "$message" "$tool_name" "$file_path"
