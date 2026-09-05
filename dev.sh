#!/usr/bin/env bash

SESSION_NAME="${PWD##*/} $(uname -srm)"
START_PROMPT="Read CLAUDE.md and begin with its session-start process."
CLAUDE_ARGS=()
CODEX_ARGS=()

# dev.sh is template-owned and replaced verbatim by template migrations.
# Project-specific launcher overrides (SESSION_NAME, START_PROMPT, CLAUDE_ARGS,
# CODEX_ARGS, ...) belong in the project-owned dev.local.sh, sourced here.
if [ -f "./dev.local.sh" ]; then
    # shellcheck disable=SC1091
    . ./dev.local.sh
fi

echo "name: $SESSION_NAME"

while true; do
    printf "Claude or Codex? "
    if ! IFS= read -r AGENT_CLI; then
        echo "No agent selected." >&2
        exit 2
    fi

    case "$AGENT_CLI" in
        [Cc]laude|[Cc])
            AGENT=claude
            break
            ;;
        [Cc]odex|[Xx])
            AGENT=codex
            break
            ;;
        *)
            echo "Please answer Claude or Codex." >&2
            ;;
    esac
done

while true; do
    printf "Send automatic session-start prompt? [Y/n] "
    if ! IFS= read -r SEND_PROMPT; then
        SEND_PROMPT=yes
        printf '\n'
    fi

    case "$SEND_PROMPT" in
        ""|[Yy]|[Yy][Ee][Ss])
            PROMPT_ARGS=("$START_PROMPT")
            break
            ;;
        [Nn]|[Nn][Oo])
            PROMPT_ARGS=()
            break
            ;;
        *)
            echo "Please answer yes or no." >&2
            ;;
    esac
done

if [ "$AGENT" = claude ]; then
    exec claude --name "$SESSION_NAME" --model fable "${CLAUDE_ARGS[@]}" "$@" "${PROMPT_ARGS[@]}"
fi

exec codex \
    --model gpt-6-astra \
    --config model_context_window=1000000 \
    --config model_auto_compact_token_limit=900000 \
    "${CODEX_ARGS[@]}" \
    "$@" \
    "${PROMPT_ARGS[@]}"
