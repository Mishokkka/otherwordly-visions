import { clampNumber, sleep, warn } from "../utils.js";
import { getSafetyProfile, mediaCache } from "./media-cache.js";

export class AudioChannel {
  constructor(){ this.active=new Set(); }
  track(sound){
    if(!sound)return null;
    this.active.add(sound);
    let cleaned=false;
    const cleanup=()=>{if(cleaned)return;cleaned=true;this.active.delete(sound);};
    try{
      if(typeof sound.addEventListener==="function"){sound.addEventListener("ended",cleanup,{once:true});sound.addEventListener("stop",cleanup,{once:true});}
      else if(typeof sound.once==="function"){sound.once("end",cleanup);sound.once("stop",cleanup);}
      else if(typeof sound.on==="function"){sound.on("end",cleanup);sound.on("stop",cleanup);}
    }catch(_error){}
    return sound;
  }
  async play(src,volume,signal){
    if(!src||signal?.aborted)return null;
    const safe=getSafetyProfile(); if(safe.emergencyMute||volume<=0)return null;
    const capped=Math.min(clampNumber(volume,0,1,.5),safe.volumeCap);
    try{
      const helper=globalThis.foundry?.audio?.AudioHelper??globalThis.AudioHelper;
      let sound;
      if(helper?.play)sound=await helper.play({src,volume:capped,autoplay:true,loop:false},false);
      else{sound=new Audio(src);sound.volume=capped;await sound.play();}
      return this.track(sound);
    }catch(error){warn("Audio playback failed",src,error);return null;}
  }
  async stop(){
    const sounds=[...this.active];this.active.clear();
    await Promise.allSettled(sounds.map(async sound=>{try{if(typeof sound.stop==="function")await sound.stop();else{sound.pause?.();if("currentTime" in sound)sound.currentTime=0;}}catch(_error){}}));
  }
}


export class VisionOverlay {
  constructor(){ this.layer=null; this.audio=new AudioChannel(); }
  ensureLayer(){ if(this.layer?.isConnected) return this.layer; this.layer=document.createElement("div"); this.layer.id="ov-flash-layer"; this.layer.setAttribute("aria-hidden","true"); document.body.appendChild(this.layer); return this.layer; }
  async show(payload,signal){
    const safe=getSafetyProfile();
    if(!safe.enabled) return {status:"suppressed",reason:"player-disabled"};
    if(safe.emergencyMute&&!payload.image&&!payload.caption) return {status:"suppressed",reason:"emergency-mute"};
    if(document.hidden&&!safe.allowHidden&&!payload.forceWhenHidden) return {status:"suppressed",reason:"hidden-tab"};
    const safety=(payload.safety??[]).map(tag=>String(tag).toLowerCase());
    if(safe.photosensitive&&safety.includes("flicker")) return {status:"suppressed",reason:"photosensitive"};
    if(safe.blockedTags.some(tag=>safety.includes(String(tag).toLowerCase()))) return {status:"suppressed",reason:"blocked-safety-tag"};
    if(!payload.image&&!payload.audio&&!payload.caption) return {status:"empty"};
    const prepared=await mediaCache.prepare(payload.image,payload.audio,{timeout:payload.preloadTimeout??5000});
    if(payload.image&&!prepared.image.ok) return {status:"error",reason:`image-${prepared.image.error}`};
    if(payload.audio&&!prepared.audio.ok&&!payload.image&&!payload.caption) return {status:"error",reason:`audio-${prepared.audio.error}`};
    if(signal?.aborted) return {status:"cancelled"};

    const reduced=safe.reducedMotion||safe.photosensitive;
    const duration=Math.max(25,Number(payload.duration)||350);
    const fade=reduced?Math.min(250,Math.max(100,duration*.2)):Math.min(180,Math.max(35,duration*.22));
    const opacity=Math.min(clampNumber(payload.opacity,.01,1,.45),safe.opacityCap);
    const scale=reduced?1:clampNumber(payload.scale,.25,3,1.02);
    const rotation=reduced?0:clampNumber(payload.rotation,-180,180,0);
    const blur=reduced?0:clampNumber(payload.blur,0,24,.4);
    const imageSrc=prepared.image?.ok?(prepared.image.src??payload.image):"";
    const audioSrc=prepared.audio?.ok?(prepared.audio.src??payload.audio):"";
    const fit=payload.fitMode==="auto"?(prepared.image.width&&prepared.image.height>prepared.image.width?"contain":"cover"):(payload.fitMode??"contain");
    const layer=this.ensureLayer();
    const frame=document.createElement("figure"); frame.className=`ov-flash-frame ov-transition-${payload.transition??"fade"}`;
    frame.style.setProperty("--ov-duration",`${duration}ms`); frame.style.setProperty("--ov-fade",`${fade}ms`); frame.style.setProperty("--ov-opacity",String(opacity)); frame.style.setProperty("--ov-scale",String(scale)); frame.style.setProperty("--ov-rotation",`${rotation}deg`); frame.style.setProperty("--ov-blur",`${blur}px`); frame.style.setProperty("--ov-edge",`${clampNumber(payload.edgeFadeSize,0,35,12)}%`); frame.dataset.blend=payload.blendMode??"screen"; frame.dataset.fit=fit; if(payload.edgeFade) frame.classList.add("has-edge-fade"); if(payload.vignette) frame.classList.add("has-vignette");
    if(imageSrc){ const image=document.createElement("img"); image.className="ov-flash-image"; image.src=imageSrc; image.alt=""; image.decoding="async"; frame.appendChild(image); } else frame.classList.add("ov-audio-only");
    if(payload.caption){ const caption=document.createElement("figcaption"); caption.textContent=payload.caption; frame.appendChild(caption); }
    layer.appendChild(frame);
    try {
      const audioResult=await this.audio.play(audioSrc,clampNumber(payload.volume,0,1,.5),signal);
      if(payload.audio&&!audioResult&&!imageSrc&&!payload.caption) return {status:"error",reason:"audio-playback"};
      requestAnimationFrame(()=>frame.classList.add("is-visible"));
      await sleep(duration,signal);
      frame.classList.remove("is-visible");
      await sleep(fade,signal);
      return {status:"shown",duration,image:imageSrc||null,audio:audioSrc||null,repairedImage:Boolean(prepared.image?.repaired),repairedAudio:Boolean(prepared.audio?.repaired)};
    } catch(error){ if(error?.name==="AbortError") return {status:"cancelled"}; throw error; }
    finally { frame.remove(); }
  }
  async stopAudio(){ await this.audio.stop(); }
  destroy(){ void this.audio.stop(); this.layer?.remove(); this.layer=null; }
}
export const overlay=new VisionOverlay();
