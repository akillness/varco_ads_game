#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="${NANOBOT_MODEL:-gemini-3.1-pro-preview}"
MINI_MODEL="${NANOBOT_MINI_MODEL:-gemini-3.1-flash-lite-preview}"
OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai}"
OPENAI_API_KEY_VALUE="${OPENAI_API_KEY:-${GEMINI_API_KEY:-}}"
CONFIG_DIR="${NANOBOT_CONFIG_DIR:-${REPO_ROOT}/.nanobot}"
LISTEN_ADDRESS="${NANOBOT_LISTEN_ADDRESS:-localhost:18080}"
HEALTHZ_PATH="${NANOBOT_HEALTHZ_PATH:-/healthz}"

ARGS=()

if ! command -v nanobot >/dev/null 2>&1; then
  echo "nanobot is not installed. Install https://github.com/HKUDS/nanobot first." >&2
  exit 127
fi

if [[ -z "${OPENAI_API_KEY_VALUE}" ]]; then
  echo "Set GEMINI_API_KEY or OPENAI_API_KEY before starting nanobot." >&2
  exit 1
fi

if [[ "${NANOBOT_DISABLE_UI:-1}" == "1" ]]; then
  ARGS+=(--disable-ui)
fi

exec nanobot run \
  -C "${REPO_ROOT}" \
  --config "${CONFIG_DIR}" \
  --default-model "${MODEL}" \
  --default-mini-model "${MINI_MODEL}" \
  --openai-api-key "${OPENAI_API_KEY_VALUE}" \
  --openai-base-url "${OPENAI_BASE_URL}" \
  --openai-chat-completion-api \
  --listen-address "${LISTEN_ADDRESS}" \
  --healthz-path "${HEALTHZ_PATH}" \
  "${ARGS[@]}" \
  "$@"
