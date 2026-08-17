# Changelog

## 1.0.13

- Hardened persisted scheduler state against in-process world/user context changes; cached schedules now reload by context and queued writes preserve their originating context.
- Invalidating the media cache now also invalidates any active Asset Doctor scan, preventing stale scan results from reappearing after the clear action.
- Split Token HUD persistence failures from HUD re-render failures so a successfully toggled flag is never reported as a failed toggle.
- Strengthened regression coverage for scheduler context switching, stale Asset Doctor progress, cache-clear scan invalidation, and legacy `maxPerSession` cleanup.
- Corrected duplicated acceptance-test numbering in the test matrix.

## 1.0.12

- Reworked automatic vision timing around persisted absolute `nextAt` deadlines instead of rerolling delays on every scheduler reconciliation.
- Browser tab switches no longer postpone random visions: future deadlines resume unchanged, while overdue hidden-tab visions wait until the player returns and then use one persistent 5–20 second grace delay.
- Page reloads restore the same client-local schedule, including an already-created overdue grace deadline, so F5 cannot continually push visions into the future.
- Hidden-tab playback, when enabled by the player, keeps the same absolute deadline and executes overdue work on the first available browser wake-up.
- Persisted schedules keep at most one pending occurrence per vision set; long absences never create a catch-up queue of multiple visions.
- Changing a set's minimum/maximum automatic delay intentionally generates a new deadline; unrelated set edits preserve the existing deadline.
- Removed the `maxPerSession` setting, runtime counter, schema field, Manager control, and localization because session boundaries are not meaningful for this client-side scheduler.
- Added scheduler persistence/regression coverage for tab changes, reload reconstruction, overdue grace behavior, hidden playback, timing changes, and legacy `maxPerSession` cleanup.

## 1.0.11

- Fixed clean Manager drafts retaining externally deleted Vision Sets, preventing accidental recreation of deleted sets.
- Guarded Asset Doctor scans against stale asynchronous results after set switches, edits, rescans, or Manager closure.
- Serialized Token HUD visibility toggles and added error handling for failed flag writes.
- Added a dedicated accessible label for clearing the full session log.
- Tightened the accessibility static check so empty `title`/`aria-label` attributes no longer pass.

## 1.0.10

- Completed the final audit pass for UX, accessibility, lifecycle cleanup, and Foundry-facing polish.
- Incorporated all five actionable CodeRabbit findings from PR #1: flattened Forbidden Lands update paths, clean-draft refresh after external state changes, migration completion ordering, async Region dispatch error handling, and immediate stale manifestation cleanup.
- Added accessible names to icon-only controls and repaired the keyboard focus outline by replacing the undefined focus color variable.
- Made the Manager responsive to its own window width with container queries and capped module windows to the current viewport.
- Made Asset Doctor progress update in place while scanning instead of remaining frozen until completion.
- Added confirmation before clearing the session log, a direct create-set action to the empty Director state, and human-readable action names in error notifications.
- Close Actor/Token editors when their backing document is deleted, without prompting to save a document that no longer exists.
- Removed misleading/dead UI and utility fragments and replaced the Russian-only schema fallback name with a neutral data-layer fallback.
- Added regression coverage for dotted Foundry update deltas, external Manager state refresh, migration cleanup failure, async Region errors, manifestation cleanup, and icon-only accessibility.

## 1.0.9

- Reworked runtime invalidation so ordinary Actor, User, Token, and Scene updates no longer fan out into unconditional scheduler, visibility, editor, and Manager work.
- Indexed active Otherworldly tokens and changed full visibility refreshes to touch only module-managed tokens; ordinary scene tokens are skipped entirely.
- Removed unconditional `refreshMesh` and legacy `Token.refresh()` from the visibility path, and suppress the duplicate core `refreshToken` reconciliation caused by our own render flags.
- Added fast raw-flag checks and normalized caches for world state, Touched Actor data, and Otherworldly Token data.
- Made viewer checks ownership-first and limited Actor/User invalidation to the current viewer or preview user where possible.
- Added explicit `controlToken` invalidation and condition-aware Scene/Actor refreshes for distance, LOS, darkness, and actor-property dependencies.
- Reworked Manager updates around coalesced, tab-aware rendering; heavy Actor, Token, orphan, playlist, and diagnostic context is now built only for the tab that needs it.
- Fixed the long-session Manager drop-listener accumulation by keeping one stable root listener for the application lifecycle.
- Debounced full Vision Set form serialization while typing while keeping immediate synchronization for committed field changes and actions.
- Removed duplicate post-Document refresh/render ownership from Manager, editors, HUD, and public API mutations so Foundry hooks own cross-client follow-up.
- Indexed trigger types, skipped inactive trigger families, limited proximity scans to indexed Otherworldly targets, and resolves eligible proximity sets once per movement.
- Reduced command/status churn by deduplicating repeated client statuses, batching session-log writes, unifying local/remote log serialization, and capping retained command errors.
- Reconciled Stage-3 manifestation timers when a token leaves the stage or timing configuration changes, preventing stale recurring timers.
- Limited scheduler media prewarm to the nearest upcoming jobs and deduplicated concurrent media loads for the same path.
- Collapsed Actor editor visibility statistics into one pass over relevant Otherworldly tokens and reused already-computed evaluations in token effects.
- Added performance-architecture regression tests for targeted visibility refresh, repository caches, proximity trigger fan-out, command batching/status deduplication, and Manager listener lifecycle.

## 1.0.8

- Fixed viewer-token resolution so elevation, distance, line-of-sight, and Region conditions use real placeable Tokens consistently.
- Restored Region enter/exit triggers for Foundry v13 through a reversible libWrapper/direct compatibility bridge around RegionDocument events.
- Implemented the advertised Forbidden Lands damage trigger by tracking reductions to actor attributes.
- Fixed Token Effects reconciliation so changes to full-ghost, light suppression, and vision suppression cannot be skipped by the effect signature cache.
- Protected unsaved Vision Set and Actor/Token/Safety editor input from destructive external rerenders and accidental close/switch/import actions.
- Removed implicit remote-command broadcast semantics: remote commands now require at least one explicit recipient.
- Made legacy migration retries idempotent by reusing current-schema UUIDs, preserving the original migration backup, generating stable legacy UUIDs, and clearing migrated legacy set storage.
- Removed the deprecated duplicate Scene Control `onClick` handler and the unused `renderCombatTrackerV2` registration for the v13 target.
- Expanded regression coverage for viewer geometry, Region event bridging, Forbidden Lands damage events, effect signatures, dirty-draft protection, explicit recipients, and migration retries.

## 1.0.7

- Removed the Otherworldly Visions manager tool from Token Controls.
- Added the manager tool to the Journal Notes Scene Control group.
- Added cleanup for stale Token Controls registrations after hot reloads.
- Synchronized the manifest, package, API, README, and test version metadata.
- Added regression coverage for the Scene Controls placement.

## 1.0.6

- Removed the inherited Font Awesome classes from ApplicationV2 close controls before inserting the classic cross.
- Suppressed any remaining generated close-control pseudo-elements so only one cross is rendered.
- Added regression coverage for the exact duplicate-icon failure.

## 1.0.5

- Rebuilt the Touched actor editor with the same dark card, toolbar, KPI, and form language used by the Vision Sets editor.
- Forced all module ApplicationV2 windows to mark their outer frame with the module class so Forbidden Lands theme rules cannot leave light window chrome around dark content.
- Replaced the module window close control with a plain classic cross in Manager, Touched Actor, Otherworldly Token, and Safety windows.
- Added regression coverage for module window chrome and the actor editor structure.

## 1.0.4

- Fixed Actor, Token, and Safety ApplicationV2 templates so every part renders exactly one root HTML element.
- Added a regression check that rejects any multi-root Handlebars part during packaging.
- Restored the Touched actor editor opening path that previously failed before rendering.

## 1.0.3

- Fixed the Touched header button on Forbidden Lands ApplicationV2 actor sheets.
- Split ApplicationV1 and ApplicationV2 header integration instead of feeding legacy `onclick` controls into V2 sheets.
- Added direct, deduplicated V2 header listeners and visible error reporting when the actor editor cannot open.

## 1.0.2

- Preserved the manager workspace, set editor, and sidebar scroll positions across ApplicationV2 rerenders.
- Restored Foundry playlist selection as a visible part of each vision set audio pool.
- Playlist tracks and standalone files are selected from one randomized audio source pool.
- Decoupled audio lifetime from image duration: sounds now play to natural completion.
- Multiple vision sounds may overlap; Stop All remains the explicit emergency stop.

## 1.0.1

- Rebuilt the manager palette so Forbidden Lands theme rules cannot produce white text on white controls.
- Replaced oversized raw media pools with compact searchable image and audio browsers.
- Fixed ApplicationV2 action dispatch and FilePicker opening.
- Removed the duplicate Touched actor sheet header control.
- Added resilient recovery for legacy media paths containing encoded leading spaces.
- Added visible action errors and new regression tests.

## 1.0.0

- Полностью разделён монолитный `main.js` на data, visibility, visions, commands, triggers, adapters, apps и API.
- Исправлена гонка планировщика генерационным токеном и правилом «одна задача на набор».
- Удалён доверенный socket fallback. Добавлен авторизованный GM world-setting command bus.
- Добавлены миграция schema v2, резервная копия и восстановление старых `visionSets`, `imageSets` и Token flags.
- Добавлены UUID наборов, очистка/ремонт ссылок и optimistic revision conflicts.
- Добавлены Director queue, priorities, conflicts, countdown, history, repeat и stop-all.
- Добавлены weighted entries, cooldowns, no-repeat window, sequences и playlists.
- Добавлены progressive revelation, visibility conditions, intermittent manifestation и Scene Otherworld Layer.
- Добавлены suppression света, зрения, интерактивности и combat tracker leaks.
- Добавлены triggers и адаптер Forbidden Lands.
- Добавлены Asset Doctor, bounded cache, negative TTL, recursive import и path rewrite.
- Переписаны ApplicationV2 Manager/Actor/Token/Safety UI и CSS по owner-file принципу.
- Добавлены русская и английская локализация, accessibility и reduced-motion режим.
- Добавлены публичные hooks/API, диагностика, экспорт/импорт и тесты.
