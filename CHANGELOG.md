# Changelog

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
