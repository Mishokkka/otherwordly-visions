import { FLAGS, MODULE_ID, SCHEMA_VERSION, SETTINGS } from "../constants.js";
import { clone, downloadJson, randomId, requireGM, unique, warn } from "../utils.js";
import { normalizeOtherworldly, normalizeState, normalizeTouched, normalizeVisionSet } from "./schemas.js";


function stableLegacyUuid(value) {
  const text = String(value ?? "legacy-set");
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

function prepareLegacySets(source) {
  if (Array.isArray(source)) return source.map((raw, index) => {
    if (!raw || typeof raw !== "object") return raw;
    const legacyId = String(raw.id ?? raw.uuid ?? index);
    return { ...raw, id: raw.id ?? legacyId, uuid: raw.uuid || stableLegacyUuid(legacyId) };
  });
  const prepared = {};
  for (const [key, raw] of Object.entries(source ?? {})) {
    if (!raw || typeof raw !== "object") { prepared[key] = raw; continue; }
    const legacyId = String(raw.id ?? raw.uuid ?? key);
    prepared[key] = { ...raw, id: raw.id ?? legacyId, uuid: raw.uuid || stableLegacyUuid(legacyId) };
  }
  return prepared;
}

export class RevisionConflictError extends Error {
  constructor(expected, actual) {
    super(`State revision conflict. Expected ${expected}, found ${actual}.`);
    this.name = "RevisionConflictError";
    this.expected = expected;
    this.actual = actual;
  }
}

export class WorldRepository {
  constructor(){this._stateRaw=null;this._stateCache=null;this._touchedCache=new WeakMap();this._otherworldlyCache=new WeakMap();}
  updateStateCache(raw=null){this._stateRaw=raw;this._stateCache=raw&&typeof raw==="object"?normalizeState(raw):null;return this._stateCache;}
  invalidateStateCache(){this._stateRaw=null;this._stateCache=null;}
  getState(){const raw=game.settings.get(MODULE_ID,SETTINGS.STATE)??{};if(this._stateCache&&(raw===this._stateRaw||Number(raw?.revision??0)===Number(this._stateCache.revision??0)))return this._stateCache;return this.updateStateCache(raw);}
  getSet(uuid) { return this.getState().sets[uuid] ?? null; }
  getSets() { return Object.values(this.getState().sets).sort((a,b)=>a.name.localeCompare(b.name)); }
  findSet(reference) {
    if (!reference) return null;
    const state = this.getState();
    return state.sets[reference] ?? Object.values(state.sets).find(set => set.slug === reference || set.legacyIds.includes(reference)) ?? null;
  }

  async commit(mutator, { expectedRevision = null } = {}) {
    requireGM("change Otherworldly Visions world data");
    const current = this.getState();
    if (expectedRevision !== null && Number(expectedRevision) !== Number(current.revision)) throw new RevisionConflictError(expectedRevision, current.revision);
    const draft = clone(current);
    const result = await mutator(draft);
    const normalized = normalizeState(draft);
    normalized.revision = current.revision + 1;
    await game.settings.set(MODULE_ID, SETTINGS.STATE, normalized);
    this.updateStateCache(game.settings.get(MODULE_ID, SETTINGS.STATE) ?? normalized);
    return { state: normalized, result };
  }

  async upsertSet(data, options = {}) {
    const set = normalizeVisionSet(data);
    return this.commit(state => { state.sets[set.uuid] = set; return set; }, options);
  }

  async deleteSet(uuid, { cleanReferences = true, replacementUuid = null, expectedRevision = null } = {}) {
    const result = await this.commit(state => { const removed = state.sets[uuid]; delete state.sets[uuid]; return removed ?? null; }, { expectedRevision });
    if (result.result && cleanReferences) await this.replaceActorSetReferences(uuid, replacementUuid);
    return result;
  }

  async replaceActorSetReferences(oldUuid, newUuid = null) {
    requireGM("repair actor set references");
    let updated = 0;
    for (const actor of game.actors ?? []) {
      const touched = this.getTouched(actor);
      if (!touched.visionSetUuids.includes(oldUuid)) continue;
      const next = touched.visionSetUuids.flatMap(uuid => uuid === oldUuid ? (newUuid ? [newUuid] : []) : [uuid]);
      await actor.setFlag(MODULE_ID, FLAGS.TOUCHED, { ...touched, visionSetUuids: unique(next) });
      updated += 1;
    }
    return updated;
  }

  invalidateTouched(actor){if(actor&&typeof actor==="object")this._touchedCache.delete(actor);}
  getTouched(actor){
    if(!actor)return normalizeTouched({});
    const raw=actor.getFlag?.(MODULE_ID,FLAGS.TOUCHED);const cached=this._touchedCache.get(actor);
    if(cached&&cached.raw===raw)return cached.data;
    const data=normalizeTouched(raw??{});this._touchedCache.set(actor,{raw,data});return data;
  }
  async setTouched(actor, patch) {
    requireGM("change Touched actor data");
    if (!actor) throw new Error("Actor not found.");
    const next = normalizeTouched({ ...this.getTouched(actor), ...(patch ?? {}) });
    await actor.setFlag(MODULE_ID, FLAGS.TOUCHED, next);
    this.invalidateTouched(actor);
    return next;
  }

  async setRevelation(actor, tokenUuid, stage) {
    requireGM("change revelation progress");
    if (!actor || !tokenUuid) throw new Error("Actor and token UUID are required.");
    const touched = this.getTouched(actor);
    const value = Math.max(0, Math.min(5, Number(stage) || 0));
    const revelations = { ...(touched.revelations ?? {}) };
    if (value > 0) revelations[tokenUuid] = value;
    else delete revelations[tokenUuid];
    const next = normalizeTouched({ ...touched, revelations });
    await actor.setFlag(MODULE_ID, FLAGS.TOUCHED, next);
    this.invalidateTouched(actor);
    return next;
  }

  invalidateOtherworldly(tokenOrDocument){const document=tokenOrDocument?.document??tokenOrDocument;if(document&&typeof document==="object")this._otherworldlyCache.delete(document);}
  getRawOtherworldly(tokenOrDocument){const document=tokenOrDocument?.document??tokenOrDocument;return document?.getFlag?.(MODULE_ID,FLAGS.OTHERWORLDLY);}
  isOtherworldlyEnabled(tokenOrDocument){return Boolean(this.getRawOtherworldly(tokenOrDocument)?.enabled);}
  getOtherworldly(tokenOrDocument) {
    const document=tokenOrDocument?.document??tokenOrDocument;if(!document)return normalizeOtherworldly({});
    const raw=this.getRawOtherworldly(document);const cached=this._otherworldlyCache.get(document);if(cached&&cached.raw===raw)return cached.data;
    const data=normalizeOtherworldly(raw??{});this._otherworldlyCache.set(document,{raw,data});return data;
  }
  async setOtherworldly(tokenOrDocument, patch) {
    requireGM("change Otherworldly token data");
    const document = tokenOrDocument?.document ?? tokenOrDocument;
    if (!document) throw new Error("Token not found.");
    const next = normalizeOtherworldly({ ...this.getOtherworldly(document), ...(patch ?? {}) });
    await document.setFlag(MODULE_ID, FLAGS.OTHERWORLDLY, next);
    this.invalidateOtherworldly(document);
    return next;
  }

  getOrphanReferences() {
    const valid = new Set(Object.keys(this.getState().sets));
    const orphans = [];
    for (const actor of game.actors ?? []) for (const uuid of this.getTouched(actor).visionSetUuids) if (!valid.has(uuid)) orphans.push({ actorId: actor.id, actorName: actor.name, setUuid: uuid });
    return orphans;
  }
  async repairOrphans() {
    requireGM("repair orphan references");
    const valid = new Set(Object.keys(this.getState().sets));
    let updated = 0;
    for (const actor of game.actors ?? []) {
      const touched = this.getTouched(actor);
      const filtered = touched.visionSetUuids.filter(uuid => valid.has(uuid));
      if (filtered.length === touched.visionSetUuids.length) continue;
      await actor.setFlag(MODULE_ID, FLAGS.TOUCHED, { ...touched, visionSetUuids: filtered });
      updated += 1;
    }
    return updated;
  }

  exportData() {
    downloadJson({ module: MODULE_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state: this.getState() }, `${MODULE_ID}-sets-${Date.now()}.json`);
  }
  async importData(payload, { replace = false } = {}) {
    requireGM("import Otherworldly Visions data");
    const imported = normalizeState(payload?.state ?? payload);
    return this.commit(state => {
      if (replace) state.sets = {};
      for (const source of Object.values(imported.sets)) {
        const set = normalizeVisionSet(source);
        if (state.sets[set.uuid]) set.uuid = randomId(16);
        if (Object.values(state.sets).some(existing => existing.slug === set.slug)) set.slug = `${set.slug}-${set.uuid.slice(0,6)}`;
        state.sets[set.uuid] = set;
      }
    });
  }

  async createMigrationBackup() {
    requireGM("create a migration backup");
    const actors = [];
    for (const actor of game.actors ?? []) {
      const raw = actor.getFlag?.(MODULE_ID, FLAGS.TOUCHED);
      if (raw !== undefined) actors.push({ uuid: actor.uuid, data: clone(raw) });
    }
    const tokens = [];
    for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) {
      const raw = token.getFlag?.(MODULE_ID, FLAGS.OTHERWORLDLY);
      if (raw !== undefined) tokens.push({ uuid: token.uuid, data: clone(raw) });
    }
    const backup = {
      module: MODULE_ID,
      createdAt: new Date().toISOString(),
      state: clone(game.settings.get(MODULE_ID, SETTINGS.STATE) ?? {}),
      legacyVisionSets: clone(game.settings.get(MODULE_ID, SETTINGS.LEGACY_VISION_SETS) ?? {}),
      actors,
      tokens
    };
    await game.settings.set(MODULE_ID, SETTINGS.MIGRATION_BACKUP, backup);
    return backup;
  }

  exportMigrationBackup() {
    const backup = game.settings.get(MODULE_ID, SETTINGS.MIGRATION_BACKUP) ?? {};
    if (!backup.createdAt) return false;
    downloadJson(backup, `${MODULE_ID}-migration-backup-${Date.now()}.json`);
    return true;
  }

  async restoreMigrationBackup() {
    requireGM("restore a migration backup");
    const backup = game.settings.get(MODULE_ID, SETTINGS.MIGRATION_BACKUP) ?? {};
    if (!backup.createdAt) throw new Error("Migration backup not found.");
    await game.settings.set(MODULE_ID, SETTINGS.STATE, backup.state ?? {});
    this.invalidateStateCache();
    await game.settings.set(MODULE_ID, SETTINGS.LEGACY_VISION_SETS, backup.legacyVisionSets ?? {});
    for (const row of backup.actors ?? []) {
      try { const actor = await fromUuid(row.uuid); if (actor) await actor.setFlag(MODULE_ID, FLAGS.TOUCHED, row.data); } catch (error) { warn("Actor backup restore failed", row.uuid, error); }
    }
    for (const row of backup.tokens ?? []) {
      try { const token = await fromUuid(row.uuid); if (token) await token.setFlag(MODULE_ID, FLAGS.OTHERWORLDLY, row.data); } catch (error) { warn("Token backup restore failed", row.uuid, error); }
    }
    await game.settings.set(MODULE_ID, SETTINGS.MIGRATION_COMPLETE, false);
  }

  async migrateLegacyData() {
    requireGM("migrate Otherworldly Visions data");
    const already = Boolean(game.settings.get(MODULE_ID, SETTINGS.MIGRATION_COMPLETE));
    const rawState = game.settings.get(MODULE_ID, SETTINGS.STATE) ?? {};
    const legacy = game.settings.get(MODULE_ID, SETTINGS.LEGACY_VISION_SETS) ?? {};
    const legacyHasSets = Object.keys(legacy).length > 0;
    const rawSchemaVersion = Number(rawState.schemaVersion ?? 0);
    const needs = !already && (legacyHasSets || rawSchemaVersion < SCHEMA_VERSION);
    if (!needs) {
      if (!already) await game.settings.set(MODULE_ID, SETTINGS.MIGRATION_COMPLETE, true);
      return { migrated: false, sets: this.getSets().length, actors: 0, tokens: 0 };
    }

    const existingBackup = game.settings.get(MODULE_ID, SETTINGS.MIGRATION_BACKUP) ?? {};
    if (!existingBackup.createdAt) await this.createMigrationBackup();

    // If STATE already reached the current schema, a previous migration may have
    // stopped after writing STATE but before finishing actor/token flags or the
    // completion marker. Reuse those UUIDs instead of rebuilding the sets.
    let state;
    if (rawSchemaVersion >= SCHEMA_VERSION && rawState.sets && typeof rawState.sets === "object") {
      state = normalizeState(rawState);
    } else {
      const source = legacyHasSets ? legacy : (rawState.sets ?? rawState);
      state = normalizeState({ sets: prepareLegacySets(source), revision: Number(rawState.revision ?? 0) });
      await game.settings.set(MODULE_ID, SETTINGS.STATE, state);
      this.updateStateCache(game.settings.get(MODULE_ID, SETTINGS.STATE) ?? state);
    }

    const idMap = new Map();
    for (const set of Object.values(state.sets)) {
      idMap.set(set.uuid, set.uuid);
      for (const id of set.legacyIds) idMap.set(id, set.uuid);
    }

    let actorCount = 0;
    for (const actor of game.actors ?? []) {
      const raw = actor.getFlag?.(MODULE_ID, FLAGS.TOUCHED);
      if (!raw) continue;
      const touched = normalizeTouched(raw);
      const oldRefs = unique(raw.visionSetUuids ?? raw.imageSets ?? []);
      touched.visionSetUuids = unique(oldRefs.map(ref => idMap.get(ref) ?? ref));
      await actor.setFlag(MODULE_ID, FLAGS.TOUCHED, touched);
      actorCount += 1;
    }

    let tokenCount = 0;
    for (const scene of game.scenes ?? []) {
      const updates = [];
      for (const token of scene.tokens ?? []) {
        const raw = token.getFlag?.(MODULE_ID, FLAGS.OTHERWORLDLY);
        if (!raw) continue;
        updates.push({ _id: token.id, [`flags.${MODULE_ID}.${FLAGS.OTHERWORLDLY}`]: normalizeOtherworldly(raw) });
      }
      if (updates.length) { await scene.updateEmbeddedDocuments("Token", updates); tokenCount += updates.length; }
    }

    await game.settings.set(MODULE_ID, SETTINGS.MIGRATION_COMPLETE, true);
    if (legacyHasSets) await game.settings.set(MODULE_ID, SETTINGS.LEGACY_VISION_SETS, {});
    return { migrated: true, sets: Object.keys(state.sets).length, actors: actorCount, tokens: tokenCount };
  }
}

export const repository = new WorldRepository();
