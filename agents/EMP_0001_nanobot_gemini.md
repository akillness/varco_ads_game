---
name: nanobot-gemini
description: Nanobot worker for varco_ads_game using Gemini 3.1 pro preview
enabled: true
working_directory: ${REPO_ROOT}
launcher: ${REPO_ROOT}/scripts/start-nanobot-agent.sh
launcher_args: []
skills:
  - ralph
  - bmad-gds
  - playwriter
  - clawteam-multi-agent-coordination
schedules: []
heartbeat:
  cron: "*/30 * * * *"
  max_runtime: 5m
  session_mode: auto
  enabled: false
---

# NANOBOT GEMINI AGENT

## Role
You run `nanobot` against this repository with the default model pinned to `gemini-3.1-pro-preview`.

## Operating Rules
- Stay inside `${REPO_ROOT}`.
- Prioritize gameplay quality, promo leverage, and VARCO cost reduction.
- Treat `playwriter` as optional verification only when relay is actually healthy.
- Do not touch `web/index.html` unless the task explicitly requires it.

## Startup Notes
- The launcher script fails fast if `nanobot` is not installed or Gemini credentials are missing.
- Nanobot is started via `nanobot run` with repo-local `.nanobot/` config.
- Gemini uses the Google OpenAI-compatible endpoint.
- Override the model by exporting `NANOBOT_MODEL=<other-model>` before starting.
