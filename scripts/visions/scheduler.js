import { MODULE_ID, PRIORITY, SETTINGS } from "../constants.js";
import { repository } from "../data/repository.js";
import { randomBetween } from "../utils.js";
import { director } from "./director.js";
import { mediaCache } from "./media-cache.js";

export class VisionScheduler {
  constructor(){ this.jobs=new Map(); this.eligibleUuids=new Set(); this.generation=0; this.running=false; this.reconcileTimer=null; this.listeners=new Set(); }
  onChange(callback){this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  emit(){const snapshot=this.snapshot();for(const callback of this.listeners){try{callback(snapshot);}catch(_error){}} Hooks.callAll(`${MODULE_ID}.schedulerChanged`,snapshot);}
  hiddenBlocked(){return Boolean(document.hidden)&&!Boolean(game.settings.get(MODULE_ID,SETTINGS.ALLOW_HIDDEN));}
  requestReconcile(delay=75){clearTimeout(this.reconcileTimer);this.reconcileTimer=window.setTimeout(()=>{this.reconcileTimer=null;this.reconcile();},Math.max(0,delay));}
  reconcile(){
    const generation=++this.generation; this.stopAll({increment:false,emit:false}); const sets=this.eligibleSets(); this.eligibleUuids=new Set(sets.map(set=>set.uuid));
    if(!game.settings.get(MODULE_ID,SETTINGS.FLASH_ENABLED)||!game.settings.get(MODULE_ID,SETTINGS.PLAYER_FLASH)||game.user?.isGM||this.hiddenBlocked()){this.emit();return;}
    this.running=true; for(const set of sets) this.schedule(set,generation,false,{prewarm:false}); this.prewarmUpcoming(); this.emit();
  }
  stopAll({increment=true,emit=true}={}){if(increment)this.generation++;this.running=false;clearTimeout(this.reconcileTimer);this.reconcileTimer=null;for(const job of this.jobs.values())clearTimeout(job.timer);this.jobs.clear();if(emit)this.emit();}
  eligibleSets(){
    const user=game.user;if(!user||user.isGM)return[];const actors=[],ids=new Set(),add=actor=>{if(actor?.id&&!ids.has(actor.id)){ids.add(actor.id);actors.push(actor);}};add(user.character);for(const actor of game.actors??[])if(actor.testUserPermission?.(user,"OWNER")??false)add(actor);
    const assigned=new Set();for(const actor of actors){const touched=repository.getTouched(actor);if(touched.enabled)for(const uuid of touched.visionSetUuids)assigned.add(uuid);}
    const state=repository.getState();return [...assigned].map(uuid=>state.sets[uuid]).filter(set=>set?.enabled&&(set.images.length||set.audio.length||set.entries.length||set.sequence.length||set.playlistIds.length));
  }
  schedule(setOrUuid,generation,emit=true,{prewarm=true}={}){
    const uuid=typeof setOrUuid==="string"?setOrUuid:setOrUuid?.uuid;if(!uuid||!this.running||generation!==this.generation||this.jobs.has(uuid))return;const set=typeof setOrUuid==="string"?repository.getSet(uuid):setOrUuid;if(!set||!this.eligibleUuids.has(uuid))return;
    const delayMs=randomBetween(set.minDelay,set.maxDelay)*1000;const nextAt=Date.now()+delayMs;const timer=window.setTimeout(()=>void this.run(uuid,generation),delayMs);this.jobs.set(uuid,{setUuid:uuid,generation,timer,nextAt,running:false});if(prewarm)this.prewarmUpcoming();if(emit)this.emit();
  }
  async run(uuid,generation){
    const job=this.jobs.get(uuid);if(!job||job.generation!==generation)return;this.jobs.delete(uuid);if(!this.running||generation!==this.generation)return;
    try{const set=repository.getSet(uuid);if(set&&this.eligibleUuids.has(uuid))await director.enqueueSet(set,{source:"scheduler",priority:PRIORITY.RANDOM,conflict:"drop",forced:false});}
    finally{if(this.running&&generation===this.generation&&this.eligibleUuids.has(uuid))this.schedule(uuid,generation,false,{prewarm:false});this.prewarmUpcoming();this.emit();}
  }
  prewarm(set){const first=set.entries?.find(e=>e.enabled!==false)??set.sequence?.[0]??{};mediaCache.prewarm(first.image??set.images?.[0],first.audio??set.audio?.[0]);}
  prewarmUpcoming(limit=3){const state=repository.getState();for(const job of [...this.jobs.values()].sort((a,b)=>a.nextAt-b.nextAt).slice(0,Math.max(1,limit))){const set=state.sets[job.setUuid];if(set)this.prewarm(set);}}
  snapshot(){return{running:this.running,generation:this.generation,jobs:[...this.jobs.values()].map(({timer,...job})=>job),eligibleUuids:[...this.eligibleUuids]};}
}
export const scheduler=new VisionScheduler();
