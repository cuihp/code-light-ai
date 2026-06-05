#!/bin/bash
source "$(dirname "$0")/_helpers.sh"

INPUT=$(cat)

stop_reason=$(extract_field "$INPUT" "reason")
message="Task finished"
[ -n "$stop_reason" ] && message="Finished: $stop_reason"

write_state_unless_done "completed" "$message"
