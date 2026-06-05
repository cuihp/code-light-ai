#!/bin/bash
source "$(dirname "$0")/_helpers.sh"

INPUT=$(cat)

if echo "$INPUT" | grep -q '"permission_prompt"\|"elicitation_dialog"'; then
    notification_type=$(extract_field "$INPUT" "notification_type")
    write_state_unless_done "waiting" "Waiting for confirmation"
fi
