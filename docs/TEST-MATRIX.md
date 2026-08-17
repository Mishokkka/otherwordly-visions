# Integration test matrix

## Required environment

Foundry VTT 13.351, Forbidden Lands 13.0.5, one GM and at least two player clients. Run once with libWrapper and once with the direct fallback.

## Acceptance checks

1. Reconcile the scheduler 100 times while an asset is loading. Each eligible set must retain exactly one job.
2. Send a forged `module.otherworldly-visions` socket packet. No cue or mutation may occur.
3. Change a set field, switch tabs, trigger a player status update and return. The unsaved draft must remain intact.
4. Open two Actor editors and two Token editors. IDs and saved documents must remain independent; close all and verify registry cleanup indirectly by reopening.
5. Move, draw and refresh 100 ordinary tokens. No full-canvas refresh should occur for each `drawToken`.
6. Check a hidden Otherworldly token as a normal player: no image, hover, click, light, sight polygon or combat tracker row.
7. Test stages 0–5 and actor-specific revelation overrides. Stage 3 must manifest intermittently and be forceable by Director.
8. Test distance, LOS, darkness, target/viewer Region, Actor property, time-on-scene and cue-shown conditions.
9. Test queue, drop, replace and replace-lower with concurrent cues, countdown cancellation and Stop All.
10. Test player safety: volume/opacity caps, reduced motion, photosensitive flicker block, blocked tags, hidden tab and Shift+M emergency mute.
11. Break one image and one audio path. Asset Doctor must report both without growing cache indefinitely.
12. Import a 0.7.5 world. Verify set migration, Actor assignments, Token flags, backup export and restore.
13. With no token selected, place the player's owned token at non-zero elevation and verify viewer-elevation, distance and LOS conditions use its real placeable geometry.
14. Enter and leave a Region with a token. `regionEnter` and `regionExit` triggers must fire once per corresponding RegionDocument event in both libWrapper and direct-fallback modes.
15. Reduce STR/AGI/WIT/EMP (and HEALTH/RESOLVE where used) on a Forbidden Lands actor. `fblDamage` must fire only on reductions and expose the changed attribute plus damage amount.
16. Edit Actor/Token/Safety forms, then cause unrelated external Actor updates. Unsaved fields must remain intact; closing a dirty editor must ask before discarding changes.
17. Edit a Vision Set, then switch set, create a set, import sets, restore migration data, or close the Manager. Every destructive transition must ask before discarding the dirty draft.
18. Call the public remote cue API with an empty recipient list. It must reject the call and must not broadcast to any client.
19. Simulate migration interruption after schema-v2 STATE is written but before the completion marker. Retry must preserve existing set UUIDs and the original backup, finish Actor/Token migration, and clear migrated legacy set storage.
20. Move ordinary non-owned tokens repeatedly while the Manager is open. Otherworldly visibility, scheduler jobs, and Manager tabs unrelated to the change must not receive full refreshes.
21. On a scene with many ordinary tokens and a small number of Otherworldly tokens, force a visibility invalidation. Only the indexed Otherworldly/effect tokens should receive module render flags; no module path should call `Token.refresh()` or request `refreshMesh`.
22. Keep the Manager open through at least 500 renders, then perform one drag-and-drop. The root must retain one drop listener and the drop handler must run once.
23. Send one remote cue to several players. Status-only `updateUser` events must not trigger canvas visibility or scheduler reconciliation; each recipient should publish one processing state and one final state at most.
24. Move a player token through proximity targets with and without `tokenApproach` triggers. With no relevant trigger there must be no proximity work; with triggers, eligible sets are resolved once per movement and only indexed Otherworldly targets are measured.
25. Change a Stage-3 token to another revelation stage or alter its intermittent timing. Old manifestation timers must be removed/replaced and must not continue refreshing the token.
26. Reconcile a player scheduler with many eligible sets. Prewarm should be limited to the nearest upcoming jobs, and repeated requests for one media path must share one in-flight load.

27. Apply an FL Actor update using a flattened dotted key such as `system.attribute.strength.value`; `fblDamage` and condition detection must match the nested-object form.
28. With a clean Manager draft open, change the same set from another GM/client; the Manager must reload the persisted set. With a dirty local draft, it must preserve the local draft and surface the normal revision conflict on save.
29. Force legacy cleanup to fail during migration; `migrationComplete` must remain false so the migration can retry safely.
30. Force a Region trigger dispatch promise to reject; the bridge must log a warning without producing an unhandled rejection.
31. Disable a stage-3 Otherworldly token; its manifestation timer/state must be removed immediately.
32. Tab through Manager and editor icon-only controls; every control must expose an accessible name and a visible focus outline.
33. Run Asset Doctor on a set with many assets; its progress element must advance without full Manager rerenders.
34. Resize the Manager narrower than 1050 px while the viewport remains wide; compact layout must follow the application width rather than the browser viewport.
