#!/bin/sh
set -eu

SECRET_PATH="/run/secrets/openai_api_key"

if [ -z "${OPENAI_API_KEY:-}" ] && [ -f "$SECRET_PATH" ]; then
  export OPENAI_API_KEY="$(cat "$SECRET_PATH")"
fi

exec node server.js
