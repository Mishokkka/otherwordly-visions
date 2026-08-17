import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, SETTINGS } from "../scripts/constants.js";

function baseSet(overrides={}){
  return {uuid:"u",name:"Set",enabled:true,images:["a.webp"],audio:[],entries:[],sequence:[],playlistIds:[],triggers:[],minDelay:10,maxDelay:10,chance:1,minOpacity:.2,maxOpacity:.4,minDuration:100,maxDuration:200,audioChance:1,minVolume:.4,maxVolume:.7,minScale:1,maxScale:1,minRotation:0,maxRotation:0,maxBlur:0,blendMode:"screen",fitMode:"contain",edgeFade:true,edgeFadeSize:12,vignette:true,safety:[],cooldown:0,noRepeatWindow:2,legacyIds:[],slug:"set",...overrides};
}

let revisionCounter=100;

function installEnvironment({set=baseSet(),hidden=false,allowHidden=false,scheduleState={}}={}){
  let state={schemaVersion:2,revision:++revisionCounter,sets:{[set.uuid]:set}};
  let storedSchedule={"world:p":structuredClone(scheduleState)};
  const actor={id:"a",getFlag:()=>({enabled:true,rank:1,tags:[],visionSetUuids:[set.uuid],revelations:{}}),testUserPermission:()=>true};
  const timers=new Map();let timerId=0;
  globalThis.document={hidden};
  globalThis.window={
    setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},
    clearTimeout(id){timers.delete(id);}
  };
  globalThis.Hooks={callAll(){}};
  globalThis.game={world:{id:"world"},user:{id:"p",isGM:false,character:actor},actors:[actor],playlists:new Map(),settings:{
    get(_scope,key){if(key===SETTINGS.STATE)return state;if(key===SETTINGS.SCHEDULE_STATE)return storedSchedule;if(key===SETTINGS.FLASH_ENABLED||key===SETTINGS.PLAYER_FLASH)return true;if(key===SETTINGS.ALLOW_HIDDEN)return allowHidden;return 0;},
    async set(_scope,key,value){if(key===SETTINGS.SCHEDULE_STATE)storedSchedule=structuredClone(value);return value;}
  }};
  return {actor,timers,get state(){return state;},setState(value){state=value;},get storedSchedule(){return storedSchedule;},setHidden(value){document.hidden=value;},setAllowHidden(value){allowHidden=value;}};
}

test("repeated reconciliation leaves one timer per eligible set",async()=>{
  installEnvironment();
  const { mediaCache }=await import("../scripts/visions/media-cache.js");
  mediaCache.prewarm=()=>{};
  const { VisionScheduler }=await import("../scripts/visions/scheduler.js");
  const scheduler=new VisionScheduler();
  for(let i=0;i<100;i++)scheduler.reconcile();
  assert.equal(scheduler.jobs.size,1);
  assert.equal(scheduler.generation,100);
  assert.equal([...scheduler.jobs.values()][0].generation,100);
  await scheduler.flushPersistence();
  scheduler.stopAll();
  assert.equal(scheduler.jobs.size,0);
});

test("absolute nextAt survives reconciles, tab changes, and scheduler reconstruction",async()=>{
  const env=installEnvironment({set:baseSet({minDelay:30,maxDelay:30})});
  const { mediaCache }=await import("../scripts/visions/media-cache.js");
  mediaCache.prewarm=()=>{};
  const { VisionScheduler }=await import("../scripts/visions/scheduler.js");
  const originalNow=Date.now;let now=1_000_000;Date.now=()=>now;
  try{
    const scheduler=new VisionScheduler();scheduler.reconcile();await scheduler.flushPersistence();
    const first=scheduler.snapshot().persistentSchedules.u.nextAt;
    assert.equal(first,1_030_000);

    now+=5_000;scheduler.reconcile();await scheduler.flushPersistence();
    assert.equal(scheduler.snapshot().persistentSchedules.u.nextAt,first,"ordinary reconcile must not reroll the interval");

    env.setHidden(true);scheduler.reconcile();await scheduler.flushPersistence();
    assert.equal(scheduler.jobs.size,0,"hidden tab with playback disabled keeps no active timer");
    assert.equal(scheduler.snapshot().persistentSchedules.u.nextAt,first,"hiding the tab preserves nextAt");

    env.setHidden(false);scheduler.reconcile();
    assert.equal([...scheduler.jobs.values()][0].nextAt,first,"returning before due time resumes the same deadline");
    scheduler.stopAll();

    const reloaded=new VisionScheduler();reloaded.reconcile();await reloaded.flushPersistence();
    assert.equal(reloaded.snapshot().persistentSchedules.u.nextAt,first,"a fresh scheduler restores the persisted absolute deadline");
    reloaded.stopAll();
  }finally{Date.now=originalNow;}
});

test("overdue hidden schedule waits for return, creates one persistent grace deadline, and does not reroll it",async()=>{
  const env=installEnvironment({set:baseSet({minDelay:10,maxDelay:10}),scheduleState:{u:{nextAt:900_000,minDelay:10,maxDelay:10}}});
  const { mediaCache }=await import("../scripts/visions/media-cache.js");
  mediaCache.prewarm=()=>{};
  const { VisionScheduler }=await import("../scripts/visions/scheduler.js");
  const originalNow=Date.now,originalRandom=Math.random;let now=1_000_000;Date.now=()=>now;Math.random=()=>0;
  try{
    env.setHidden(true);const scheduler=new VisionScheduler();scheduler.reconcile();
    assert.equal(scheduler.jobs.size,0,"overdue cue is not played while hidden when background playback is disabled");
    assert.equal(scheduler.snapshot().persistentSchedules.u.graceAt,undefined);

    env.setHidden(false);scheduler.reconcile();await scheduler.flushPersistence();
    const firstJob=[...scheduler.jobs.values()][0];
    assert.equal(firstJob.fireAt,1_005_000,"returning assigns the minimum five-second grace delay");
    assert.equal(scheduler.snapshot().persistentSchedules.u.graceAt,1_005_000);

    now=1_001_000;scheduler.reconcile();
    assert.equal([...scheduler.jobs.values()][0].fireAt,1_005_000,"reconciliation during grace must not restart the grace period");

    const reloaded=new VisionScheduler();reloaded.reconcile();
    assert.equal([...reloaded.jobs.values()][0].fireAt,1_005_000,"reload during grace restores the same grace deadline");
    scheduler.stopAll();reloaded.stopAll();
  }finally{Date.now=originalNow;Math.random=originalRandom;}
});

test("hidden playback keeps the same absolute deadline and overdue work is armed immediately",async()=>{
  const env=installEnvironment({set:baseSet({minDelay:10,maxDelay:10}),hidden:true,allowHidden:true,scheduleState:{u:{nextAt:900_000,minDelay:10,maxDelay:10}}});
  const { mediaCache }=await import("../scripts/visions/media-cache.js");
  mediaCache.prewarm=()=>{};
  const { VisionScheduler }=await import("../scripts/visions/scheduler.js");
  const originalNow=Date.now;Date.now=()=>1_000_000;
  try{
    const scheduler=new VisionScheduler();scheduler.reconcile();
    const job=[...scheduler.jobs.values()][0];
    assert.equal(job.nextAt,900_000);
    assert.equal(job.fireAt,1_000_000);
    assert.equal(job.overdue,true);
    scheduler.stopAll();
  }finally{Date.now=originalNow;env.setAllowHidden(false);}
});

test("changing only timing configuration intentionally creates a new absolute deadline",async()=>{
  installEnvironment({set:baseSet({minDelay:10,maxDelay:10}),scheduleState:{u:{nextAt:1_010_000,minDelay:10,maxDelay:10}}});
  const { VisionScheduler }=await import("../scripts/visions/scheduler.js");
  const originalNow=Date.now;Date.now=()=>1_000_000;
  try{
    const scheduler=new VisionScheduler();scheduler.ensureScheduleStateLoaded();
    const changed=scheduler.ensureSchedule(baseSet({minDelay:40,maxDelay:40}));
    assert.equal(changed.nextAt,1_040_000);
    assert.equal(changed.minDelay,40);
    assert.equal(changed.maxDelay,40);
    await scheduler.flushPersistence();
  }finally{Date.now=originalNow;}
});

test("one overdue deadline produces one cue and advances to one future schedule without catch-up",async()=>{
  const env=installEnvironment({set:baseSet({minDelay:10,maxDelay:10}),scheduleState:{u:{nextAt:900_000,minDelay:10,maxDelay:10}}});
  const { mediaCache }=await import("../scripts/visions/media-cache.js");
  mediaCache.prewarm=()=>{};
  const { director }=await import("../scripts/visions/director.js");
  const { VisionScheduler }=await import("../scripts/visions/scheduler.js");
  const originalNow=Date.now,originalRandom=Math.random,originalEnqueue=director.enqueueSet;let now=1_000_000,cues=0;Date.now=()=>now;Math.random=()=>0;
  director.enqueueSet=async()=>{cues++;return{status:"shown"};};
  try{
    const scheduler=new VisionScheduler();scheduler.reconcile();
    const firstJob=[...scheduler.jobs.values()][0];
    assert.equal(firstJob.fireAt,1_005_000);
    now=1_005_000;
    await scheduler.run("u",scheduler.generation);
    await scheduler.flushPersistence();
    assert.equal(cues,1,"an arbitrarily old deadline must produce only one cue");
    assert.equal(scheduler.jobs.size,1,"after the cue there is exactly one future job");
    const snapshot=scheduler.snapshot();
    assert.equal(snapshot.persistentSchedules.u.nextAt,1_015_000,"the next interval starts from the actual overdue cue attempt");
    assert.equal(snapshot.persistentSchedules.u.graceAt,undefined,"the consumed overdue grace is not carried into the next interval");
    scheduler.stopAll();
  }finally{Date.now=originalNow;Math.random=originalRandom;director.enqueueSet=originalEnqueue;env.setHidden(false);}
});
