# Nanobot + Agent Manager Setup

## Current Status
- `nanobot`: installed via Homebrew and available in PATH
- `gemini`: installed at `/opt/homebrew/bin/gemini`
- `GEMINI_API_KEY`: available in current shell
- Google Gemini OpenAI-compatible endpoint is reachable, but direct chat tests can return `HTTP 429` when quota is exhausted

## Repo-local Preparation Completed
- `agents/EMP_0001_nanobot_gemini.md` created for `agent-manager`
- `scripts/start-nanobot-agent.sh` uses `nanobot run`
- repo-local `.nanobot/agents/main.md` provides the default agent prompt
- `HEARTBEAT.md` added for recurring agent check-ins

## Start Command After Nanobot Is Installed
```bash
CLI="python3 /Users/jangyoung/.gemini/skills/agent-manager/scripts/main.py"
cd /Users/jangyoung/Documents/Github/varco_ads_game
$CLI list
$CLI start EMP_0001_nanobot_gemini
$CLI status EMP_0001_nanobot_gemini
$CLI monitor EMP_0001_nanobot_gemini --follow
```

## Override the Model
```bash
export NANOBOT_MODEL=gemini-3.1-pro-preview
```

## Launcher Behavior
The repo-local launcher now uses:

```bash
scripts/start-nanobot-agent.sh
```

It resolves:

- repo root automatically
- config from `.nanobot/`
- `GEMINI_API_KEY` or `OPENAI_API_KEY`
- Google OpenAI-compatible base URL: `https://generativelanguage.googleapis.com/v1beta/openai`
- chat completions mode for compatibility

## Notes
- `gemini-3.1-pro-preview` is available in the live Gemini model list on March 20, 2026.
- Nanobot startup can be verified with a local health endpoint even when model quota blocks a live prompt.
- Global Gemini settings should not be required for this repo-local launcher.
