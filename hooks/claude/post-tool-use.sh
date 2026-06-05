#!/bin/bash
source "$(dirname "$0")/_helpers.sh"

INPUT=$(cat)

tool_name=$(extract_field "$INPUT" "tool_name")
file_path=$(extract_field "$INPUT" "file_path")
command=$(extract_field "$INPUT" "command")
query=$(extract_field "$INPUT" "query")
message=$(make_message "$tool_name" "$file_path" "$command" "$query")

write_state_unless_done "working" "$message" "$tool_name" "$file_path" "$command" "$query"
