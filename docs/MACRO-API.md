# Macro and module API

```js
const ov = game.modules.get("otherworldly-visions").api;
```

## UI

```js
ov.openManager();
ov.openSafety();
ov.openActorEditor(actor);
ov.openTokenEditor(token.document);
```

## Read-only

```js
ov.getState();
ov.getSets();
ov.getSet("slug-or-uuid");
ov.getTouched(actor);
ov.getOtherworldly(token.document);
ov.evaluateVisibility(token.document, game.user);
ov.getDirectorState();
ov.getSchedulerState();
```

## Playback

```js
await ov.cueLocal("dreams", { conflict: "replace-lower", countdown: 2 });
await ov.cueFor("dreams", [userId], { countdown: 3 }); // GM only
ov.stopLocal();
await ov.stopFor([userId]); // GM only
```

## World mutations, GM only

```js
await ov.setTouched(actor, { enabled: true, rank: 2, tags: ["void"] });
await ov.setRevelation(actor, token.document.uuid, 3);
await ov.setOtherworldly(token.document, { enabled: true, requiredRank: 2 });
await ov.upsertSet(setData);
await ov.deleteSet(setUuid);
```

## Triggers and manifestation

```js
await ov.fireTrigger("sceneReady", { sceneId: canvas.scene.id });
ov.manifestLocal(token.document, 2500);
await ov.manifestFor(token.document, [userId], 2500); // GM only
```

## Hooks

- `otherworldly-visions.apiReady(api)`
- `otherworldly-visions.beforeCue(cue)`: return `false` to suppress locally.
- `otherworldly-visions.afterCue(cue, result)`
- `otherworldly-visions.visibilityChanged(token, evaluation)`
- `otherworldly-visions.schedulerChanged(snapshot)`
