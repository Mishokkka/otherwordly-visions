import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, MODULE_ID } from "./constants.js";

export function clone(value) {
  if (value === undefined) return undefined;
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function merge(base, override) {
  if (globalThis.foundry?.utils?.mergeObject) return foundry.utils.mergeObject(clone(base), override ?? {}, { inplace: false, recursive: true });
  return { ...clone(base), ...(override ?? {}) };
}

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function asArray(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean);
  return [];
}

export function unique(values) { return [...new Set(asArray(values))]; }

export function slugify(value, fallback = "set") {
  const slug = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9а-яё_.-]/gi, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug || fallback;
}

export function randomId(length = 16) {
  return globalThis.foundry?.utils?.randomID?.(length) ?? crypto.randomUUID().replaceAll("-", "").slice(0, length);
}

export function hasExtension(path, extensions) {
  const clean = String(path ?? "").split("?")[0].split("#")[0].toLowerCase();
  return extensions.some(extension => clean.endsWith(extension));
}
export const isImagePath = path => hasExtension(path, IMAGE_EXTENSIONS);
export const isAudioPath = path => hasExtension(path, AUDIO_EXTENSIONS);

export function parsePathList(text, predicate = () => true) {
  return unique(String(text ?? "").split(/[\n,;]+/).map(path => path.trim().replace(/^['"]|['"]$/g, "")).filter(path => path && predicate(path)));
}


export function assetCandidates(path) {
  const raw = String(path ?? "").trim();
  if (!raw) return [];
  const candidates = [];
  const add = value => {
    const candidate = String(value ?? "").trim();
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };
  add(raw);
  let decoded = raw;
  for (let i = 0; i < 2; i++) {
    try { decoded = decodeURI(decoded); add(decoded); } catch (_error) { break; }
  }
  for (const value of [...candidates]) {
    add(value.replace(/\/(?:%25)?20+/gi, "/"));
    add(value.replace(/\/\s+/g, "/"));
  }
  for (const value of [...candidates]) {
    try { add(encodeURI(value)); } catch (_error) {}
  }
  return candidates.slice(0, 8);
}

export function assetName(path) {
  const raw = String(path ?? "").split(/[?#]/)[0];
  const leaf = raw.split("/").pop() || raw;
  try { return decodeURIComponent(leaf).trim() || leaf; } catch (_error) { return leaf.trim() || leaf; }
}

export function pickRandom(values) { return Array.isArray(values) && values.length ? values[Math.floor(Math.random() * values.length)] : null; }
export function randomBetween(min, max) { const lo = Math.min(Number(min), Number(max)); const hi = Math.max(Number(min), Number(max)); return lo + Math.random() * (hi - lo); }
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener?.("abort", onAbort);
    const finish = () => { if (settled) return; settled = true; cleanup(); resolve(); };
    const onAbort = () => { if (settled) return; settled = true; clearTimeout(timer); cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(finish, Math.max(0, ms));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}


export function getProperty(object, path, fallback = undefined) {
  const getter = globalThis.foundry?.utils?.getProperty;
  if (getter) return getter(object, path) ?? fallback;
  return String(path).split(".").reduce((value, key) => value?.[key], object) ?? fallback;
}

export function documentKey(document) { return document?.uuid ?? `${document?.parent?.id ?? "scene"}.${document?.id ?? "unknown"}`; }

export function downloadJson(data, filename) {
  const text = JSON.stringify(data, null, 2);
  if (globalThis.saveDataToFile) return saveDataToFile(text, "application/json", filename);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}


export function applyWindowChrome(application) {
  const raw = application?.element;
  const element = raw?.querySelector || raw?.closest || raw?.matches ? raw : raw?.[0];
  if (!element) return null;
  const frame = element.matches?.(".application") ? element : element.closest?.(".application");
  if (!frame) return null;
  frame.classList?.add(MODULE_ID);
  const close = frame.querySelector?.('.window-header [data-action="close"], .window-header .window-close');
  if (close) {
    // ApplicationV2 often puts Font Awesome classes directly on the close
    // button. Replacing its children alone leaves the generated ::before
    // glyph in place, producing both the old dot/icon and our cross.
    for (const className of Array.from(close.classList ?? [])) {
      if (/^(?:fa(?:-[a-z0-9-]+)?|fas|far|fal|fat|fad|fab)$/i.test(className)) {
        close.classList?.remove?.(className);
      }
    }
    close.classList?.add("ov-classic-close");
    close.innerHTML = '<span class="ov-close-glyph" aria-hidden="true">×</span>';
    const label = globalThis.game?.i18n?.localize?.("APPLICATION.Close") || "Close";
    close.setAttribute?.("aria-label", label);
    close.setAttribute?.("title", label);
  }
  return frame;
}

export function requireGM(action = "perform this action") {
  if (game.user?.isGM) return true;
  throw new Error(`${MODULE_ID} | Only a GM may ${action}.`);
}

export function log(...args) { try { if (game.settings?.get(MODULE_ID, "debug")) console.log(`${MODULE_ID} |`, ...args); } catch (_error) {} }
export function warn(...args) { console.warn(`${MODULE_ID} |`, ...args); }
export function error(...args) { console.error(`${MODULE_ID} |`, ...args); }

export function debounceFrame(fn) {
  let frame = null;
  return (...args) => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { frame = null; fn(...args); });
  };
}

export async function confirmDialog(title, content) {
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (DialogV2?.confirm) return DialogV2.confirm({ window: { title }, content, rejectClose: false, modal: true });
  return globalThis.Dialog?.confirm?.({ title, content }) ?? false;
}

export function sanitizeRemoteOptions(options = {}) {
  const allowed = {};
  if (["queue", "drop", "replace", "replace-lower"].includes(options.conflict)) allowed.conflict = options.conflict;
  for (const key of ["countdown", "priority", "duration", "opacity", "volume", "scale", "rotation", "blur"]) {
    const number = Number(options[key]);
    if (Number.isFinite(number)) allowed[key] = number;
  }
  for (const key of ["forceAudio", "forceWhenHidden", "forced"]) if (typeof options[key] === "boolean") allowed[key] = options[key];
  if (typeof options.source === "string") allowed.source = options.source.slice(0, 80);
  if (typeof options.entryId === "string") allowed.entryId = options.entryId.slice(0, 100);
  return allowed;
}
