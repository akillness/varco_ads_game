## Goal

Raise the gameplay ceiling of `VARCO Agent SAGA` while making the promo loop and VARCO-assisted content workflow meaningfully more valuable in a single bounded pass.

## Scope

1. Add higher-skill gameplay systems that fit the current arcade loop.
2. Add a promo/studio workflow that converts one campaign brief into reusable sound/asset directions.
3. Add server-side VARCO caching and studio-pack APIs to reduce repeated generation cost.
4. Update verification so the changed UI/API paths are actually covered.

## Constraints

- Preserve the current dirty worktree and build on top of it.
- Keep the implementation compatible with mock mode when `VARCO_OPENAPI_KEY` is absent.
- `nanobot` is not installed locally, so sub-agent execution will use available local agents only.
- `playwriter` is installed but its relay is not healthy enough to rely on as the primary verifier in this run.

## Planned Changes

### Gameplay

- Add per-hero active abilities with cooldown/charge.
- Add rotating mission objectives with rewards so each run has short-term goals.
- Surface clearer combat/progression feedback in the HUD.

### Promo + VARCO Workflow

- Add a `studio-pack` server API that turns one campaign brief into reusable prompts and marketing copy.
- Add cache-aware VARCO proxy behavior for repeated sound/model generation.
- Let the web editor consume suggested prompts from the generated studio pack.

### Verification

- Keep production build green.
- Update API + browser tests for the new studio pack and gameplay HUD.
- Run local verification commands and record blockers if browser automation cannot attach.

## Completion Criteria

- The app builds successfully.
- The new gameplay systems are visible and playable from the existing UI.
- VARCO studio features show a clear cost-saving path via prompt reuse/caching.
- The updated API/UI tests pass locally, or any remaining failure is isolated and explained.
