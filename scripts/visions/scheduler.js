import { MODULE_ID, PRIORITY, SETTINGS } from "../constants.js";
import { repository } from "../data/repository.js";
import { randomBetween, warn } from "../utils.js";
import { director } from "./director.js";
import { mediaCache } from "./media-cache.js";

const OVERDUE_GRACE_MIN_MS=5000;
const OVERDUE_GRACE_MAX_MS=20000;

function timingFor(set){return{minDelay:Number(set?.minDelay)||1,maxDelay:Number(set?.maxDelay)||1};}
function scheduleContextKey(){return `${game.world?.id??"world"}:${game.user?.id??"user"}`;}
function cleanScheduleEntry(value){
  const nextAt=Number(value?.nextAt),minDelay=Number(value?.minDelay),maxDelay=Number(value?.maxDelay),graceAt=Number(value?.graceAt);
  if(!Number.isFinite(nextAt)||nextAt<=0||!Number.isFinite(minDelay)||!Number.isFinite(maxDelay))return null;
  const entry={nextAt,minDelay,maxDelay};
  if(Number.isFinite(graceAt)&&graceAt>0)entry.graceAt=graceAt;
  return entry;
}

export class VisionScheduler {
  constructor(){
    this.jobs=new Map();
    this.eligibleUuids=new Set();
    this.generation=0;
    this.running=false;
    this.reconcileTimer=null;
    this.listeners=new Set();
    this.scheduleState={};
    this.scheduleStateLoaded=false;
    this.persistQueued=false;
    this.persistPromise=Promise.resolve();
  }
  onChange(callback){this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  emit(){const snapshot=this.snapshot();for(const callback of this.listeners){try{callback(snapshot);}catch(_error){}} Hooks.callAll(`${MODULE_ID}.schedulerChanged`,snapshot);}
  hiddenBlocked(){return Boolean(document.hidden)&&!Boolean(game.settings.get(MODULE_ID,SETTINGS.ALLOW_HIDDEN));}
  requestReconcile(delay=75){clearTimeout(this.reconcileTimer);this.reconcileTimer=window.setTimeout(()=>{this.reconcileTimer=null;this.reconcile();},Math.max(0,delay));}
  ensureScheduleStateLoaded(){
    if(this.scheduleStateLoaded)return;
    const stored=game.settings.get(MODULE_ID,SETTINGS.SCHEDULE_STATE)??{},raw=stored?.[scheduleContextKey()]??{},clean={};
    for(const [uuid,value] of Object.entries(raw)){const entry=cleanScheduleEntry(value);if(entry)clean[uuid]=entry;}
    this.scheduleState=clean;this.scheduleStateLoaded=true;
  }
  queuePersist(){
    if(this.persistQueued)return;
    this.persistQueued=true;
    const enqueue=()=>{
      this.persistQueued=false;
      const snapshot=JSON.parse(JSON.stringify(this.scheduleState)),contextKey=scheduleContextKey();
      this.persistPromise=this.persistPromise.then(()=>{const current=game.settings.get(MODULE_ID,SETTINGS.SCHEDULE_STATE)??{},stored=current&&typeof current==="object"&&!Array.isArray(current)?{...current}:{};if(Object.keys(snapshot).length)stored[contextKey]=snapshot;else delete stored[contextKey];return game.settings.set(MODULE_ID,SETTINGS.SCHEDULE_STATE,stored);}).catch(error=>warn("Scheduler state persistence failed",error));
    };
    if(typeof queueMicrotask==="function")queueMicrotask(enqueue);else Promise.resolve().then(enqueue);
  }
  async flushPersistence(){if(this.persistQueued)await Promise.resolve();await this.persistPromise;}
  replaceSchedule(set,now=Date.now()){
    this.ensureScheduleStateLoaded();
    const timing=timingFor(set),nextAt=now+randomBetween(timing.minDelay,timing.maxDelay)*1000;
    this.scheduleState[set.uuid]={nextAt,...timing};this.queuePersist();return this.scheduleState[set.uuid];
  }
  ensureSchedule(set){
    this.ensureScheduleStateLoaded();
    const timing=timingFor(set),current=cleanScheduleEntry(this.scheduleState[set.uuid]);
    if(!current||current.minDelay!==timing.minDelay||current.maxDelay!==timing.maxDelay)return this.replaceSchedule(set);
    this.scheduleState[set.uuid]=current;return current;
  }
  syncScheduleState(sets){
    this.ensureScheduleStateLoaded();
    const eligible=new Set(sets.map(set=>set.uuid));let changed=false;
    for(const uuid of Object.keys(this.scheduleState))if(!eligible.has(uuid)){delete this.scheduleState[uuid];changed=true;}
    for(const set of sets){
      const timing=timingFor(set),current=cleanScheduleEntry(this.scheduleState[set.uuid]);
      if(!current||current.minDelay!==timing.minDelay||current.maxDelay!==timing.maxDelay){const nextAt=Date.now()+randomBetween(timing.minDelay,timing.maxDelay)*1000;this.scheduleState[set.uuid]={nextAt,...timing};changed=true;}
      else this.scheduleState[set.uuid]=current;
    }
    if(changed)this.queuePersist();
  }
  clearScheduleState(){this.ensureScheduleStateLoaded();if(!Object.keys(this.scheduleState).length)return;this.scheduleState={};this.queuePersist();}
  reconcile(){
    const generation=++this.generation;this.stopAll({increment:false,emit:false});const sets=this.eligibleSets();this.eligibleUuids=new Set(sets.map(set=>set.uuid));
    const playbackEnabled=Boolean(game.settings.get(MODULE_ID,SETTINGS.FLASH_ENABLED))&&Boolean(game.settings.get(MODULE_ID,SETTINGS.PLAYER_FLASH))&&!game.user?.isGM;
    if(!playbackEnabled){this.clearScheduleState();this.emit();return;}
    this.syncScheduleState(sets);
    if(this.hiddenBlocked()){this.emit();return;}
    this.running=true;for(const set of sets)this.schedule(set,generation,false,{prewarm:false});this.prewarmUpcoming();this.emit();
  }
  stopAll({increment=true,emit=true}={}){if(increment)this.generation++;this.running=false;clearTimeout(this.reconcileTimer);this.reconcileTimer=null;for(const job of this.jobs.values())clearTimeout(job.timer);this.jobs.clear();if(emit)this.emit();}
  eligibleSets(){
    const user=game.user;if(!user||user.isGM)return[];const actors=[],ids=new Set(),add=actor=>{if(actor?.id&&!ids.has(actor.id)){ids.add(actor.id);actors.push(actor);}};add(user.character);for(const actor of game.actors??[])if(actor.testUserPermission?.(user,"OWNER")??false)add(actor);
    const assigned=new Set();for(const actor of actors){const touched=repository.getTouched(actor);if(touched.enabled)for(const uuid of touched.visionSetUuids)assigned.add(uuid);}
    const state=repository.getState();return[...assigned].map(uuid=>state.sets[uuid]).filter(set=>set?.enabled&&(set.images.length||set.audio.length||set.entries.length||set.sequence.length||set.playlistIds.length));
  }
  schedule(setOrUuid,generation,emit=true,{prewarm=true}={}){
    const uuid=typeof setOrUuid==="string"?setOrUuid:setOrUuid?.uuid;if(!uuid||!this.running||generation!==this.generation||this.jobs.has(uuid))return;const set=typeof setOrUuid==="string"?repository.getSet(uuid):setOrUuid;if(!set||!this.eligibleUuids.has(uuid))return;
    const entry=this.ensureSchedule(set),now=Date.now(),overdue=entry.nextAt<=now;let fireAt=entry.nextAt;
    if(overdue&&!document.hidden&&!entry.graceAt){entry.graceAt=now+randomBetween(OVERDUE_GRACE_MIN_MS,OVERDUE_GRACE_MAX_MS);this.queuePersist();}
    if(overdue&&entry.graceAt)fireAt=entry.graceAt;else if(overdue&&document.hidden)fireAt=now;
    const delayMs=Math.max(0,fireAt-now),timer=window.setTimeout(()=>void this.run(uuid,generation),delayMs);
    this.jobs.set(uuid,{setUuid:uuid,generation,timer,nextAt:entry.nextAt,fireAt,overdue,running:false});if(prewarm)this.prewarmUpcoming();if(emit)this.emit();
  }
  async run(uuid,generation){
    const job=this.jobs.get(uuid);if(!job||job.generation!==generation)return;this.jobs.delete(uuid);if(!this.running||generation!==this.generation)return;
    const set=repository.getSet(uuid);if(!set||!this.eligibleUuids.has(uuid)){delete this.scheduleState[uuid];this.queuePersist();this.emit();return;}
    this.replaceSchedule(set);
    try{await director.enqueueSet(set,{source:"scheduler",priority:PRIORITY.RANDOM,conflict:"drop",forced:false});}
    finally{if(this.running&&generation===this.generation&&this.eligibleUuids.has(uuid))this.schedule(uuid,generation,false,{prewarm:false});this.prewarmUpcoming();this.emit();}
  }
  prewarm(set){const first=set.entries?.find(e=>e.enabled!==false)??set.sequence?.[0]??{};mediaCache.prewarm(first.image??set.images?.[0],first.audio??set.audio?.[0]);}
  prewarmUpcoming(limit=3){const state=repository.getState();for(const job of[...this.jobs.values()].sort((a,b)=>a.fireAt-b.fireAt).slice(0,Math.max(1,limit))){const set=state.sets[job.setUuid];if(set)this.prewarm(set);}}
  snapshot(){return{running:this.running,generation:this.generation,jobs:[...this.jobs.values()].map(({timer,...job})=>job),eligibleUuids:[...this.eligibleUuids],persistentSchedules:JSON.parse(JSON.stringify(this.scheduleState))};}
}
export const scheduler=new VisionScheduler();
