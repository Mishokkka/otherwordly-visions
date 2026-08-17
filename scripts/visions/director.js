import { CONFLICT, MODULE_ID, PRIORITY } from "../constants.js";
import { repository } from "../data/repository.js";
import { clampNumber, clone, pickRandom, randomBetween, randomId, sleep, warn } from "../utils.js";
import { getSafetyProfile } from "./media-cache.js";
import { overlay } from "./overlay.js";

function playlistAudioPaths(set) {
  const paths=[];
  for(const id of set?.playlistIds??[]){ const playlist=game.playlists?.get?.(id); for(const sound of playlist?.sounds?.contents??playlist?.sounds??[]){ const path=sound?.path??sound?.src; if(path) paths.push(path); } }
  return [...new Set(paths)];
}

class WeightedSelector {
  constructor(){ this.history=new Map(); this.cooldowns=new Map(); }
  reset(setUuid=null){ if(!setUuid){this.history.clear();this.cooldowns.clear();return;} this.history.delete(setUuid); for(const key of [...this.cooldowns.keys()]) if(key.startsWith(`${setUuid}:`)) this.cooldowns.delete(key); }
  entries(set){ if(set.entries?.length) return set.entries; return (set.images??[]).map((image,index)=>({id:`legacy-${index}-${image}`,image,audio:"",weight:1,duration:0,caption:"",tags:[],safety:[],cooldown:0,enabled:true})); }
  choose(set){
    const entries=this.entries(set).filter(entry=>entry.enabled!==false); if(!entries.length) return null;
    const now=Date.now(), recent=this.history.get(set.uuid)??[];
    let pool=entries.filter(entry=>(this.cooldowns.get(`${set.uuid}:${entry.id}`)??0)<=now&&!recent.slice(-set.noRepeatWindow).includes(entry.id));
    if(!pool.length) pool=entries.filter(entry=>(this.cooldowns.get(`${set.uuid}:${entry.id}`)??0)<=now); if(!pool.length) pool=entries;
    const total=pool.reduce((sum,e)=>sum+Math.max(.01,Number(e.weight)||1),0); let roll=Math.random()*total; let selected=pool.at(-1);
    for(const entry of pool){ roll-=Math.max(.01,Number(entry.weight)||1); if(roll<=0){selected=entry;break;} }
    this.history.set(set.uuid,[...recent,selected.id].slice(-Math.max(1,set.noRepeatWindow+8)));
    if(selected.cooldown>0) this.cooldowns.set(`${set.uuid}:${selected.id}`,now+selected.cooldown*1000);
    return clone(selected);
  }
}

export class VisionDirector {
  constructor(){ this.queue=[]; this.current=null; this.processing=false; this.history=[]; this.selector=new WeightedSelector(); this.lastCueAt=0; this.setSessionCounts=new Map(); this.setCooldowns=new Map(); this.listeners=new Set(); }
  onChange(callback){ this.listeners.add(callback); return()=>this.listeners.delete(callback); }
  emit(){ const snapshot=this.snapshot(); for(const callback of this.listeners){try{callback(snapshot);}catch(_error){}} }
  canRunSet(set,{forced=false}={}){
    if(!set?.enabled) return {ok:false,reason:"set-disabled"};
    if(!forced&&Math.random()>set.chance) return {ok:false,reason:"chance"};
    const count=this.setSessionCounts.get(set.uuid)??0; if(!forced&&set.maxPerSession>0&&count>=set.maxPerSession) return {ok:false,reason:"session-limit"};
    if(!forced&&(this.setCooldowns.get(set.uuid)??0)>Date.now()) return {ok:false,reason:"set-cooldown"};
    const minimum=getSafetyProfile().minimumInterval*1000; if(!forced&&minimum>0&&Date.now()-this.lastCueAt<minimum) return {ok:false,reason:"minimum-interval"};
    return {ok:true};
  }
  buildPayload(set, entry={}, overrides={}){
    const sounds=[...(set.audio??[]),...playlistAudioPaths(set)];
    const audio=entry.audio || (Math.random()<=set.audioChance?pickRandom(sounds):"") || "";
    return {
      image:entry.image||pickRandom(set.images)||"", audio, caption:entry.caption||"",
      safety:[...(set.safety??[]),...(entry.safety??[])],
      duration:clampNumber(overrides.duration??entry.duration,set.minDuration,set.maxDuration,randomBetween(set.minDuration,set.maxDuration)),
      opacity:clampNumber(overrides.opacity,set.minOpacity,set.maxOpacity,randomBetween(set.minOpacity,set.maxOpacity)),
      volume:clampNumber(overrides.volume,set.minVolume,set.maxVolume,randomBetween(set.minVolume,set.maxVolume)),
      scale:clampNumber(overrides.scale,set.minScale,set.maxScale,randomBetween(set.minScale,set.maxScale)),
      rotation:clampNumber(overrides.rotation,set.minRotation,set.maxRotation,randomBetween(set.minRotation,set.maxRotation)),
      blur:clampNumber(overrides.blur,0,set.maxBlur,randomBetween(0,set.maxBlur)),
      blendMode:set.blendMode, fitMode:set.fitMode, edgeFade:set.edgeFade, edgeFadeSize:set.edgeFadeSize, vignette:set.vignette,
      transition:overrides.transition??"fade", forceWhenHidden:Boolean(overrides.forceWhenHidden)
    };
  }
  buildAssetPayload(set,asset){ return this.buildPayload(set,asset,{duration:asset.duration}); }
  buildSetCue(setOrUuid,options={}){
    const set=typeof setOrUuid==="string"?repository.findSet(setOrUuid):setOrUuid; if(!set) throw new Error("Vision set not found.");
    const allowed=this.canRunSet(set,{forced:Boolean(options.forced)}); if(!allowed.ok) return {skipped:true,reason:allowed.reason,set};
    const entry=options.entryId?set.entries?.find(item=>item.id===options.entryId):this.selector.choose(set);
    const sequence=(set.sequence??[]).length ? set.sequence.map(step=>({delay:step.delay,payload:this.buildPayload(set,step,{duration:step.duration,transition:step.transition})})) : null;
    return { id:randomId(18), setUuid:set.uuid, setName:set.name, source:options.source??"unknown", priority:Number(options.priority??PRIORITY.RANDOM), conflict:options.conflict??CONFLICT.QUEUE, countdown:clampNumber(options.countdown,0,30,0), forced:Boolean(options.forced), createdAt:Date.now(), payload:sequence?null:this.buildPayload(set,entry??{},options), sequence, metadata:clone(options.metadata??{}) };
  }
  enqueueSet(setOrUuid,options={}){ const cue=this.buildSetCue(setOrUuid,options); if(cue.skipped) return Promise.resolve({status:"skipped",reason:cue.reason}); return this.enqueueCue(cue); }
  enqueuePayload(payload,options={}){ const cue={id:randomId(18),setUuid:options.setUuid??null,setName:options.setName??"Direct cue",source:options.source??"direct",priority:Number(options.priority??PRIORITY.MANUAL),conflict:options.conflict??CONFLICT.QUEUE,countdown:clampNumber(options.countdown,0,30,0),forced:true,createdAt:Date.now(),payload:clone(payload),sequence:null,metadata:clone(options.metadata??{})}; return this.enqueueCue(cue); }
  enqueueCue(cue){
    return new Promise(resolve=>{
      const item={cue,resolve};
      if(this.current){
        if(cue.conflict===CONFLICT.DROP){resolve({status:"dropped",reason:"busy"});return;}
        if(cue.conflict===CONFLICT.REPLACE||(cue.conflict===CONFLICT.REPLACE_LOWER&&cue.priority>this.current.cue.priority)) this.current.controller.abort("replaced");
      }
      this.queue.push(item); this.queue.sort((a,b)=>b.cue.priority-a.cue.priority||a.cue.createdAt-b.cue.createdAt); this.emit(); void this.process();
    });
  }
  async process(){
    if(this.processing) return; this.processing=true;
    try{
      while(this.queue.length){
        const item=this.queue.shift(); const controller=new AbortController(); this.current={cue:item.cue,controller,startedAt:Date.now()}; this.emit(); let result;
        try{ result=await this.runCue(item.cue,controller.signal); }
        catch(error){ result=error?.name==="AbortError"?{status:"cancelled"}:{status:"error",reason:String(error?.message??error)}; if(result.status==="error") warn("Cue failed",error); }
        if(result.status==="shown"){
          this.lastCueAt=Date.now();
          if(item.cue.setUuid){ const set=repository.getSet(item.cue.setUuid); this.setSessionCounts.set(item.cue.setUuid,(this.setSessionCounts.get(item.cue.setUuid)??0)+1); if(set?.cooldown>0) this.setCooldowns.set(item.cue.setUuid,Date.now()+set.cooldown*1000); }
        }
        this.history.unshift({at:new Date().toISOString(),cue:clone(item.cue),result:clone(result)}); this.history.length=Math.min(this.history.length,100);
        try{ Hooks.callAll(`${MODULE_ID}.afterCue`,clone(item.cue),clone(result)); }catch(_error){}
        item.resolve(result); this.current=null; this.emit();
      }
    } finally { this.processing=false; this.current=null; this.emit(); }
  }
  async runCue(cue,signal){
    if(cue.countdown>0) await sleep(cue.countdown*1000,signal);
    const allowed=Hooks.call?.(`${MODULE_ID}.beforeCue`,clone(cue)); if(allowed===false) return {status:"suppressed",reason:"hook"};
    if(cue.sequence?.length){ const steps=[]; for(const step of cue.sequence){ if(step.delay>0) await sleep(step.delay,signal); const result=await overlay.show(step.payload,signal); steps.push(result); if(["cancelled","error"].includes(result.status)) return {status:result.status,reason:result.reason,steps}; } return {status:steps.some(step=>step.status==="shown")?"shown":"suppressed",steps}; }
    return overlay.show(cue.payload,signal);
  }
  stopAll(reason="stopped"){ for(const item of this.queue.splice(0)) item.resolve({status:"cancelled",reason}); this.current?.controller?.abort(reason); void overlay.stopAudio(); this.emit(); }
  repeatLast(){ const row=this.history.find(item=>item.result?.status==="shown"); return row?this.enqueueCue({...clone(row.cue),id:randomId(18),createdAt:Date.now(),source:"repeat",priority:PRIORITY.MANUAL,conflict:CONFLICT.REPLACE_LOWER}):Promise.resolve({status:"skipped",reason:"no-history"}); }
  resetSession(){ this.selector.reset(); this.setSessionCounts.clear(); this.setCooldowns.clear(); this.history=[]; this.lastCueAt=0; this.emit(); }
  snapshot(){ return { current:this.current?{...clone(this.current.cue),startedAt:this.current.startedAt}:null, queue:this.queue.map(item=>clone(item.cue)), history:clone(this.history.slice(0,30)), lastCueAt:this.lastCueAt, sessionCounts:Object.fromEntries(this.setSessionCounts) }; }
}
export const director=new VisionDirector();
