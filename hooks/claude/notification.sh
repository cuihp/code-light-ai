#!/bin/bash
source "$(dirname "$0")/_helpers.sh"

INPUT=$(cat)

if echo "$INPUT" | grep -q '"permission_prompt"\|"elicitation_dialog"'; then
    write_state_unless_done "waiting" "Waiting for confirmation"
fi
