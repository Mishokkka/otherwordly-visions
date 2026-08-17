import { MODULE_ID, SETTINGS } from "../constants.js";
import { assetCandidates, clampNumber, unique, warn } from "../utils.js";

class BoundedCache {
  constructor(limit = 160) { this.limit = limit; this.map = new Map(); }
  get size() { return this.map.size; }
  get(key) { const value = this.map.get(key); if (value) { this.map.delete(key); this.map.set(key,value); } return value; }
  set(key, value) { this.map.delete(key); this.map.set(key,value); while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value); }
  delete(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function withTimeout(factory, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    let cancel = () => {};
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { cancel(); } catch (_error) {}
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok:false, error:"timeout", at:Date.now() }), timeoutMs);
    try {
      cancel = factory(finish) ?? (() => {});
      if (settled) try { cancel(); } catch (_error) {}
    }
    catch (error) { finish({ ok:false, error:String(error?.message ?? error), at:Date.now() }); }
  });
}

async function loadImageCandidate(src, timeout) {
  return withTimeout(done => {
    const image = new Image();
    const cleanup = () => { image.onload = null; image.onerror = null; };
    image.onload = () => done({ ok:true, src, at:Date.now(), width:image.naturalWidth, height:image.naturalHeight });
    image.onerror = () => done({ ok:false, src, at:Date.now(), error:"load" });
    image.decoding = "async";
    image.src = src;
    if (image.complete && image.naturalWidth) done({ ok:true, src, at:Date.now(), width:image.naturalWidth, height:image.naturalHeight });
    return cleanup;
  }, timeout);
}

async function loadAudioCandidate(src, timeout) {
  return withTimeout(done => {
    const audio = new Audio();
    const ready = () => done({ ok:true, src, at:Date.now(), duration:Number(audio.duration)||0 });
    const failed = () => done({ ok:false, src, at:Date.now(), error:"load" });
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", ready);
      audio.removeEventListener("canplay", ready);
      audio.removeEventListener("error", failed);
      try { audio.pause(); } catch (_error) {}
      audio.removeAttribute?.("src");
    };
    audio.preload="metadata";
    audio.addEventListener("loadedmetadata", ready, {once:true});
    audio.addEventListener("canplay", ready, {once:true});
    audio.addEventListener("error", failed, {once:true});
    audio.src=src;
    audio.load();
    if (audio.readyState >= 2) ready();
    return cleanup;
  }, timeout);
}

async function resolveCandidate(requestedSrc, loader, timeout) {
  const started = Date.now();
  const candidates = assetCandidates(requestedSrc);
  let last = { ok:false, src:requestedSrc, requestedSrc, at:Date.now(), error:"load" };
  for (const candidate of candidates) {
    const remaining = Math.max(250, timeout - (Date.now() - started));
    const result = await loader(candidate, Math.min(remaining, 1800));
    last = { ...result, requestedSrc };
    if (result.ok) return { ...last, repaired:candidate !== requestedSrc };
    if (Date.now() - started >= timeout) break;
  }
  return last;
}

export class MediaCache {
  constructor() { this.images = new BoundedCache(180); this.audio = new BoundedCache(120); this.imagePending=new Map();this.audioPending=new Map();this.negativeTtlMs = 30000; }
  async prepareImage(src, timeout = 5000) {
    if (!src) return { ok:true, empty:true, src:"" };
    const cached = this.images.get(src);
    if (cached && (cached.ok || Date.now() - cached.at < this.negativeTtlMs)) return cached;
    if(this.imagePending.has(src))return this.imagePending.get(src);
    const pending=resolveCandidate(src,loadImageCandidate,timeout).then(result=>{this.images.set(src,result);return result;}).finally(()=>this.imagePending.delete(src));this.imagePending.set(src,pending);return pending;
  }
  async prepareAudio(src, timeout = 5000) {
    if (!src) return { ok:true, empty:true, src:"" };
    const cached = this.audio.get(src);
    if (cached && (cached.ok || Date.now() - cached.at < this.negativeTtlMs)) return cached;
    if(this.audioPending.has(src))return this.audioPending.get(src);
    const pending=resolveCandidate(src,loadAudioCandidate,timeout).then(result=>{this.audio.set(src,result);return result;}).finally(()=>this.audioPending.delete(src));this.audioPending.set(src,pending);return pending;
  }
  async prepare(image, audio, { timeout = 5000 } = {}) {
    const [imageResult,audioResult]=await Promise.all([this.prepareImage(image,timeout),this.prepareAudio(audio,timeout)]);
    return { image:imageResult, audio:audioResult };
  }
  prewarm(image, audio) { void this.prepare(image,audio).catch(error=>warn("Media prewarm failed",error)); }
  invalidate(paths=[]) { for (const path of paths) { this.images.delete(path); this.audio.delete(path); } }
  clear() { this.images.clear(); this.audio.clear(); }
  async scanSet(set, onProgress=()=>{}) {
    const playlistAudio=[];
    for(const id of set.playlistIds??[]){const playlist=game.playlists?.get?.(id);for(const sound of playlist?.sounds?.contents??playlist?.sounds??[]){const path=sound?.path??sound?.src;if(path)playlistAudio.push(path);}}
    const images=unique([...(set.images??[]),...(set.entries??[]).map(e=>e.image),...(set.sequence??[]).map(s=>s.image)].filter(Boolean));
    const audio=unique([...(set.audio??[]),...(set.entries??[]).map(e=>e.audio),...(set.sequence??[]).map(s=>s.audio),...playlistAudio].filter(Boolean));
    const rows=[...images.map(src=>({src,type:"image"})),...audio.map(src=>({src,type:"audio"}))];
    const results=[]; let completed=0; onProgress({completed,total:rows.length});
    for (const row of rows) {
      const result=row.type==="image"?await this.prepareImage(row.src):await this.prepareAudio(row.src);
      results.push({...row,...result}); completed++; onProgress({completed,total:rows.length});
    }
    return {
      setUuid:set.uuid,
      total:rows.length,
      ok:results.filter(r=>r.ok).length,
      repaired:results.filter(r=>r.ok&&r.repaired).length,
      errors:results.filter(r=>!r.ok),
      results
    };
  }
  snapshot() { return { images:this.images.size, audio:this.audio.size, pendingImages:this.imagePending.size,pendingAudio:this.audioPending.size,negativeTtlMs:this.negativeTtlMs }; }
}
export const mediaCache = new MediaCache();

export function getSafetyProfile() {
  return {
    enabled: game.settings.get(MODULE_ID, SETTINGS.PLAYER_FLASH),
    volumeCap: clampNumber(game.settings.get(MODULE_ID, SETTINGS.VOLUME_CAP),0,1,1),
    opacityCap: clampNumber(game.settings.get(MODULE_ID, SETTINGS.OPACITY_CAP),.05,1,1),
    reducedMotion: Boolean(game.settings.get(MODULE_ID, SETTINGS.REDUCED_MOTION)),
    photosensitive: Boolean(game.settings.get(MODULE_ID, SETTINGS.PHOTOSENSITIVE)),
    blockedTags: unique(game.settings.get(MODULE_ID, SETTINGS.BLOCKED_SAFETY_TAGS)),
    allowHidden: Boolean(game.settings.get(MODULE_ID, SETTINGS.ALLOW_HIDDEN)),
    minimumInterval: clampNumber(game.settings.get(MODULE_ID, SETTINGS.MIN_INTERVAL),0,3600,0),
    emergencyMute: Boolean(game.settings.get(MODULE_ID, SETTINGS.EMERGENCY_MUTE))
  };
}
