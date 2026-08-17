import { DEFAULT_ENTRY, DEFAULT_OTHERWORLDLY, DEFAULT_SEQUENCE_STEP, DEFAULT_TOUCHED, DEFAULT_TRIGGER, DEFAULT_VISION_SET, SCHEMA_VERSION } from "../constants.js";
import { clampNumber, clone, isAudioPath, isImagePath, merge, randomId, slugify, unique } from "../utils.js";

const CONDITION_TYPES = new Set(["scene", "targetRegion", "viewerRegion", "targetElevation", "viewerElevation", "actorProperty", "user", "timeOnScene", "cueShown"]);
const CONDITION_OPERATORS = new Set(["in", "notIn", "equals", "notEquals", "greater", "greaterOrEqual", "less", "lessOrEqual", "contains"]);

export function normalizeCondition(data = {}) {
  const type = CONDITION_TYPES.has(String(data.type)) ? String(data.type) : "scene";
  const listType = ["scene", "targetRegion", "viewerRegion", "user", "cueShown"].includes(type);
  const operator = CONDITION_OPERATORS.has(String(data.operator)) ? String(data.operator) : (listType ? "in" : "greaterOrEqual");
  return { id: String(data.id || randomId(10)), type, operator, path: String(data.path ?? "").slice(0, 200), value: listType ? unique(data.value) : String(data.value ?? "").slice(0, 500), enabled: data.enabled !== false };
}

export function normalizeTouched(data = {}) {
  const touched = merge(DEFAULT_TOUCHED, data);
  const hasCurrent = Object.prototype.hasOwnProperty.call(data ?? {}, "visionSetUuids");
  const refs = hasCurrent ? data.visionSetUuids : data.imageSets;
  touched.schemaVersion = SCHEMA_VERSION;
  touched.enabled = Boolean(touched.enabled);
  touched.rank = clampNumber(touched.rank, 0, 20, 1);
  touched.tags = unique(touched.tags);
  touched.visionSetUuids = unique(refs ?? touched.visionSetUuids);
  touched.revelations = typeof touched.revelations === "object" && touched.revelations ? clone(touched.revelations) : {};
  delete touched.imageSets;
  return touched;
}

export function normalizeOtherworldly(data = {}) {
  const value = merge(DEFAULT_OTHERWORLDLY, data);
  value.schemaVersion = SCHEMA_VERSION;
  value.enabled = Boolean(value.enabled);
  value.requiredRank = clampNumber(value.requiredRank, 0, 20, 1);
  value.requiredTags = unique(value.requiredTags);
  value.viewerOpacity = clampNumber(value.viewerOpacity, 0.05, 1, 1);
  value.visualEffect = ["none", "void", "warp", "pulse", "spectral"].includes(String(value.visualEffect)) ? String(value.visualEffect) : "void";
  value.effectIntensity = clampNumber(value.effectIntensity, 0.1, 3, 1);
  value.revealStage = clampNumber(value.revealStage, 0, 5, 4);
  for (const key of ["fullGhost", "suppressLight", "suppressVision", "hideCombatant", "requireLineOfSight"]) value[key] = Boolean(value[key]);
  value.maxDistance = clampNumber(value.maxDistance, 0, 100000, 0);
  value.minDarkness = clampNumber(value.minDarkness, 0, 1, 0);
  value.maxDarkness = clampNumber(value.maxDarkness, 0, 1, 1);
  if (value.maxDarkness < value.minDarkness) value.maxDarkness = value.minDarkness;
  value.intermittentMinDelay = clampNumber(value.intermittentMinDelay, 1, 3600, 5);
  value.intermittentMaxDelay = clampNumber(value.intermittentMaxDelay, 1, 3600, 14);
  if (value.intermittentMaxDelay < value.intermittentMinDelay) value.intermittentMaxDelay = value.intermittentMinDelay;
  value.intermittentDuration = clampNumber(value.intermittentDuration, 0.1, 60, 1.5);
  value.conditions = Array.isArray(value.conditions) ? value.conditions.map(normalizeCondition) : [];
  return value;
}

export function normalizeEntry(data = {}) {
  const entry = merge(DEFAULT_ENTRY, data);
  entry.id = String(entry.id || randomId(10));
  entry.image = isImagePath(entry.image) ? String(entry.image) : "";
  entry.audio = isAudioPath(entry.audio) ? String(entry.audio) : "";
  entry.weight = clampNumber(entry.weight, 0.01, 1000, 1);
  entry.duration = clampNumber(entry.duration, 0, 60000, 0);
  entry.caption = String(entry.caption ?? "").slice(0, 500);
  entry.tags = unique(entry.tags);
  entry.safety = unique(entry.safety);
  entry.cooldown = clampNumber(entry.cooldown, 0, 86400, 0);
  entry.enabled = entry.enabled !== false;
  return entry;
}

export function normalizeSequenceStep(data = {}) {
  const step = merge(DEFAULT_SEQUENCE_STEP, data);
  step.id = String(step.id || randomId(10));
  step.delay = clampNumber(step.delay, 0, 600000, 0);
  step.duration = clampNumber(step.duration, 25, 60000, 350);
  step.image = isImagePath(step.image) ? String(step.image) : "";
  step.audio = isAudioPath(step.audio) ? String(step.audio) : "";
  step.caption = String(step.caption ?? "").slice(0, 500);
  step.transition = ["fade", "cut", "pulse"].includes(String(step.transition)) ? String(step.transition) : "fade";
  return step;
}

export function normalizeTrigger(data = {}) {
  const trigger = merge(DEFAULT_TRIGGER, data);
  trigger.id = String(trigger.id || randomId(10));
  trigger.enabled = trigger.enabled !== false;
  trigger.type = String(trigger.type || "manual").slice(0, 80);
  trigger.chance = clampNumber(trigger.chance, 0, 1, 1);
  trigger.cooldown = clampNumber(trigger.cooldown, 0, 86400, 0);
  trigger.config = typeof trigger.config === "object" && trigger.config ? clone(trigger.config) : {};
  return trigger;
}

export function normalizeVisionSet(data = {}) {
  const set = merge(DEFAULT_VISION_SET, data);
  const oldId = String(data?.id ?? "");
  set.uuid = String(set.uuid || randomId(16));
  set.legacyIds = unique([...(set.legacyIds ?? []), oldId].filter(Boolean));
  set.name = String(set.name || "Vision Set").slice(0, 160);
  set.slug = slugify(set.slug || oldId || set.name, `set-${set.uuid.slice(0, 6)}`);
  set.enabled = set.enabled !== false;
  set.safety = unique(set.safety);
  set.images = unique(set.images).filter(isImagePath);
  set.audio = unique(set.audio).filter(isAudioPath);
  set.playlistIds = unique(set.playlistIds);
  set.entries = Array.isArray(set.entries) ? set.entries.map(normalizeEntry) : [];
  set.sequence = Array.isArray(set.sequence) ? set.sequence.map(normalizeSequenceStep) : [];
  set.triggers = Array.isArray(set.triggers) ? set.triggers.map(normalizeTrigger) : [];
  for (const [key, min, max, fallback] of [["minDelay",1,86400,45],["maxDelay",1,86400,180],["chance",0,1,.35],["cooldown",0,86400,0],["noRepeatWindow",0,1000,2],["minOpacity",.01,1,.18],["maxOpacity",.01,1,.65],["minDuration",25,60000,120],["maxDuration",25,60000,650],["audioChance",0,1,1],["minVolume",0,1,.45],["maxVolume",0,1,.75],["minScale",.25,3,1],["maxScale",.25,3,1.08],["minRotation",-180,180,-2],["maxRotation",-180,180,2],["maxBlur",0,24,.8],["edgeFadeSize",0,35,12]]) set[key]=clampNumber(set[key],min,max,fallback);
  for (const [minKey,maxKey] of [["minDelay","maxDelay"],["minOpacity","maxOpacity"],["minDuration","maxDuration"],["minVolume","maxVolume"],["minScale","maxScale"],["minRotation","maxRotation"]]) if (set[maxKey] < set[minKey]) set[maxKey]=set[minKey];
  set.blendMode = ["screen", "lighten", "normal", "overlay", "soft-light", "difference"].includes(String(set.blendMode)) ? String(set.blendMode) : "screen";
  set.fitMode = ["auto", "contain", "cover"].includes(String(set.fitMode)) ? String(set.fitMode) : "auto";
  set.edgeFade = Boolean(set.edgeFade);
  set.vignette = Boolean(set.vignette);
  delete set.id;
  delete set.maxPerSession;
  return set;
}

export function normalizeState(data = {}) {
  const sets = {};
  const source = data?.sets ?? data ?? {};
  const iterable = Array.isArray(source) ? source.map((set, index) => [set?.uuid || set?.id || String(index), set]) : Object.entries(source);
  for (const [key, raw] of iterable) {
    if (!raw || typeof raw !== "object") continue;
    const set = normalizeVisionSet({ ...raw, uuid: raw.uuid || undefined, id: raw.id || key });
    sets[set.uuid] = set;
  }
  return { schemaVersion: SCHEMA_VERSION, revision: clampNumber(data?.revision, 0, Number.MAX_SAFE_INTEGER, 0), sets };
}
