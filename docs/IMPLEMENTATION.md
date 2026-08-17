# Implementation map

## Runtime layers

- `scripts/data`: schema v2 normalization, UUID sets, repository, migration, backup, imports, reference repair.
- `scripts/visibility`: viewer profile cache, condition AST, distance/LOS/darkness/Region rules, progressive stages, reversible Token visibility patch and PIXI presentation.
- `scripts/visions`: bounded media cache, safe DOM overlay, audio channel, Director and generation-safe scheduler.
- `scripts/commands`: GM-authorized world-setting command transport with TTL, recipients, deduplication and rate limit.
- `scripts/triggers`: generic trigger engine and Forbidden Lands adapter.
- `scripts/apps`: ApplicationV2 manager, Actor/Token editors and per-client safety UI.
- `scripts/api.js`: immutable public API with GM guards on mutating operations.

## Data compatibility

Legacy set IDs are retained in `legacyIds`. Actor `imageSets` values are converted to `visionSetUuids`. Existing Otherworldly token flags are normalized without discarding old fields. A backup is written before the first migration and contains world state plus every matching Actor and Token flag.

## Visibility model

The visibility getter only makes the final visibility decision. Presentation is changed through Token mesh/state refresh, not `token.visible` or root `token.alpha`. Hidden manifestations also disable interaction and, when configured, suppress light, sight and combat tracker disclosure. Original mesh filters, alpha, cursor, event mode and source activation are restored.

## Concurrency model

A scheduler reconciliation increments a generation, cancels all in-memory timers, computes eligible UUIDs once and creates at most one timeout per set. The random schedule itself is stored as a client-scoped absolute `nextAt` deadline under a world-and-user context key, so ordinary reconciliation, tab visibility changes, and page reloads reuse the same deadline instead of rolling a new interval. If hidden-tab playback is disabled, an overdue deadline remains pending while hidden and receives one persisted 5–20 second grace deadline on return; missed periods never accumulate into a catch-up queue. Timing changes (`minDelay`/`maxDelay`) intentionally replace the saved deadline. Async cue execution never recreates an old-generation job. Director serializes playback, applies conflict policy and emits exactly one `afterCue` result for each accepted cue.

## Security model

Only a GM can write the command setting. A receiver additionally verifies that the issuer still exists and is a GM, checks expiry, recipients, deduplication and a local rate window, and validates that requested media belongs to the referenced set. Public mutators call `requireGM`.

## Runtime invalidation model

Document hooks are classified before fan-out. Module flags, viewer ownership, movement, scene dependencies, and client status each invalidate only the services that actually depend on them. Full visibility refreshes operate on an index of active Otherworldly tokens rather than every token on the scene. The module uses Foundry v13 render flags directly and does not invoke legacy `Token.refresh()` from its own visibility path.

The Manager coalesces live render requests and prepares heavy data per active tab. Repository reads keep normalized revision/flag caches with explicit invalidation on module writes and Foundry change hooks. Trigger discovery is indexed by type, proximity targets use the current Otherworldly index, and command diagnostics batch non-critical log/status traffic.
