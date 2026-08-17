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
