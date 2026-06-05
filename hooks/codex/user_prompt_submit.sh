#!/bin/bash
source "$(dirname "$0")/_helpers.sh"

INPUT=$(cat)
SESSION_ID=$(get_session_id_from_input "$INPUT")

[ -n "$SESSION_ID" ] && write_state_unless_done "$SESSION_ID" "working" "User prompt submitted"
