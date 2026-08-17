import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, FLAGS, SETTINGS } from "../scripts/constants.js";

if(typeof globalThis.requestAnimationFrame!=="function")globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
if(typeof globalThis.cancelAnimationFrame!=="function")globalThis.cancelAnimationFrame=handle=>clearTimeout(handle);

test("visibility refresh targets only tracked Otherworldly tokens and avoids legacy full refresh",async()=>{
  const user={id:"gm",isGM:true};
  const rawEnabled={enabled:true,revealStage:4,conditions:[]};
  const ordinaryDoc={id:"ordinary",uuid:"Scene.s.Token.ordinary",getFlag(){return undefined;}};
  const specialDoc={id:"special",uuid:"Scene.s.Token.special",getFlag(_scope,key){return key===FLAGS.OTHERWORLDLY?rawEnabled:undefined;}};
  const ordinaryCalls=[],specialCalls=[];
  const ordinary={document:ordinaryDoc,renderFlags:{set:flags=>ordinaryCalls.push(flags)},refresh(){ordinaryCalls.push("refresh");}};
  const special={document:specialDoc,renderFlags:{set:flags=>specialCalls.push(flags)},refresh(){specialCalls.push("refresh");}};
  ordinaryDoc.object=ordinary;specialDoc.object=special;
  const byId=new Map([[ordinaryDoc.id,ordinary],[specialDoc.id,special]]);
  globalThis.Hooks={callAll(){}};
  globalThis.game={user,actors:[],users:{get(){return null;}},settings:{get(_scope,key){if(key===SETTINGS.STATE)return{schemaVersion:2,revision:0,sets:{}};return undefined;}}};
  globalThis.canvas={scene:{id:"s",darkness:0,grid:{distance:1}},tokens:{controlled:[],placeables:[ordinary,special],get:id=>byId.get(id)},grid:{size:100}};
  globalThis.window={setTimeout,clearTimeout};
  const { VisibilityService }=await import(`../scripts/visibility/visibility-service.js?perf-refresh=${Date.now()}`);
  const service=new VisibilityService();
  service.markSceneReady();
  service.refreshAll();
  assert.deepEqual(ordinaryCalls,[]);
  assert.equal(specialCalls.length,1);
  assert.deepEqual(specialCalls[0],{refreshVisibility:true,refreshState:true});
  assert.equal(specialCalls.includes("refresh"),false);
});

test("repository caches normalized document data while the raw flag reference is unchanged",async()=>{
  const rawTouched={enabled:true,rank:2,tags:["x"],visionSetUuids:[],revelations:{}};
  const rawOtherworldly={enabled:true,revealStage:4,conditions:[]};
  const actor={getFlag(_scope,key){return key===FLAGS.TOUCHED?rawTouched:undefined;}};
  const token={getFlag(_scope,key){return key===FLAGS.OTHERWORLDLY?rawOtherworldly:undefined;}};
  globalThis.game={settings:{get(){return{schemaVersion:2,revision:3,sets:{}};}}};
  const { WorldRepository }=await import(`../scripts/data/repository.js?perf-cache=${Date.now()}`);
  const repository=new WorldRepository();
  assert.strictEqual(repository.getTouched(actor),repository.getTouched(actor));
  assert.strictEqual(repository.getOtherworldly(token),repository.getOtherworldly(token));
});

test("proximity trigger discovery runs once per movement and only checks indexed targets",async()=>{
  globalThis.game={user:{id:"p",isGM:false},system:{id:"forbidden-lands"},actors:[]};
  const moving={id:"moving",object:{center:{x:0,y:0}},actor:{id:"a"}};
  const targets=[
    {id:"one",object:{center:{x:100,y:0}}},
    {id:"two",object:{center:{x:200,y:0}}}
  ];
  globalThis.canvas={scene:{id:"s"},tokens:{get(id){return id==="moving"?moving.object:targets.find(row=>row.id===id)?.object;}}};
  const { visibilityService }=await import("../scripts/visibility/visibility-service.js");
  const originalGet=visibilityService.getOtherworldlyDocuments;
  visibilityService.getOtherworldlyDocuments=()=>targets;
  const { TriggerService }=await import(`../scripts/triggers/trigger-service.js?perf-proximity=${Date.now()}`);
  const service=new TriggerService();let eligibleCalls=0,fireCalls=0;
  service.hasTriggerType=type=>type==="tokenApproach";
  service.eligibleTriggeredSets=type=>{assert.equal(type,"tokenApproach");eligibleCalls+=1;return[{uuid:"set"}];};
  service.measureDistance=()=>1;
  service.firePrepared=async(type,context,sets)=>{assert.equal(type,"tokenApproach");assert.equal(sets.length,1);assert.ok(context.targetToken);fireCalls+=1;};
  service.fireProximity(moving);
  await Promise.resolve();
  visibilityService.getOtherworldlyDocuments=originalGet;
  assert.equal(eligibleCalls,1);
  assert.equal(fireCalls,2);
});

test("command status writes deduplicate and diagnostics buffers stay bounded/batched",async()=>{
  let statusWrites=0,logWrites=0;
  const values=new Map([[SETTINGS.SESSION_LOG,[]]]);
  globalThis.canvas={scene:{id:"s"}};
  globalThis.game={user:{id:"p",isGM:false,async setFlag(scope,key){assert.equal(scope,MODULE_ID);assert.equal(key,FLAGS.CLIENT_STATUS);statusWrites+=1;}},settings:{get(_scope,key){return values.get(key);},async set(_scope,key,value){values.set(key,value);if(key===SETTINGS.SESSION_LOG)logWrites+=1;return value;}}};
  const { CommandBus }=await import(`../scripts/commands/command-bus.js?perf-command=${Date.now()}`);
  const bus=new CommandBus();
  await bus.publishStatus("ready",{safety:true});
  await bus.publishStatus("ready",{safety:true});
  assert.equal(statusWrites,1);
  for(let index=0;index<150;index++)bus.recordError({index});
  assert.equal(bus.errors.length,100);
  const first=bus.appendSessionLog({direction:"local",id:"1",type:"cueResult",issuerId:"p",recipients:["p"]});
  const second=bus.appendSessionLog({direction:"local",id:"2",type:"cueResult",issuerId:"p",recipients:["p"]});
  await Promise.all([first,second]);
  assert.equal(logWrites,1);
  assert.deepEqual(values.get(SETTINGS.SESSION_LOG).slice(0,2).map(row=>row.id),["2","1"]);
});

test("media cache shares one in-flight load for repeated prewarm requests",async()=>{
  let loads=0;
  globalThis.Image=class {
    constructor(){this.complete=false;this.naturalWidth=0;this.naturalHeight=0;this.onload=null;this.onerror=null;}
    set src(value){this._src=value;loads+=1;queueMicrotask(()=>{this.complete=true;this.naturalWidth=32;this.naturalHeight=32;this.onload?.();});}
    get src(){return this._src;}
  };
  const { MediaCache }=await import(`../scripts/visions/media-cache.js?perf-media=${Date.now()}`);
  const cache=new MediaCache();
  const [a,b]=await Promise.all([cache.prepareImage("visions/same.webp"),cache.prepareImage("visions/same.webp")]);
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(loads,1);assert.equal(cache.imagePending.size,0);
});
