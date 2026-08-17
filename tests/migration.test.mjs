import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, SETTINGS } from "../scripts/constants.js";

function actor(id,flag){return{id,name:id,uuid:`Actor.${id}`,_flag:structuredClone(flag),getFlag(){return this._flag;},async setFlag(_scope,_key,value){this._flag=structuredClone(value);}};}
function token(id,flag){return{id,name:id,uuid:`Scene.s.Token.${id}`,_flag:structuredClone(flag),getFlag(){return this._flag;}};}

test("0.7.5 migration preserves sets, actor references and token flags",async()=>{
  const settings=new Map([
    [`${MODULE_ID}.${SETTINGS.STATE}`,{}],
    [`${MODULE_ID}.${SETTINGS.LEGACY_VISION_SETS}`,{"visions-old":{id:"visions-old",name:"Old visions",images:["visions/old.webp"]}}],
    [`${MODULE_ID}.${SETTINGS.MIGRATION_COMPLETE}`,false],
    [`${MODULE_ID}.${SETTINGS.MIGRATION_BACKUP}`,{}]
  ]);
  const a=actor("a",{enabled:true,rank:2,tags:["void"],imageSets:["visions-old"]});
  const t=token("t",{enabled:true,requiredRank:2,visualEffect:"warp"});
  const scene={id:"s",tokens:[t],async updateEmbeddedDocuments(_type,updates){for(const update of updates){const target=this.tokens.find(row=>row.id===update._id);target._flag=structuredClone(update[`flags.${MODULE_ID}.otherworldly`]);}}};
  globalThis.game={user:{isGM:true},actors:[a],scenes:[scene],settings:{get:(scope,key)=>settings.get(`${scope}.${key}`),set:async(scope,key,value)=>{settings.set(`${scope}.${key}`,structuredClone(value));return value;}}};
  const { repository }=await import("../scripts/data/repository.js");
  const result=await repository.migrateLegacyData();
  assert.equal(result.migrated,true);
  assert.equal(result.sets,1);
  const state=settings.get(`${MODULE_ID}.${SETTINGS.STATE}`);
  const set=Object.values(state.sets)[0];
  assert.equal(set.name,"Old visions");
  assert.deepEqual(a._flag.visionSetUuids,[set.uuid]);
  assert.equal(a._flag.imageSets,undefined);
  assert.equal(t._flag.enabled,true);
  assert.equal(t._flag.schemaVersion,2);
  assert.ok(settings.get(`${MODULE_ID}.${SETTINGS.MIGRATION_BACKUP}`).createdAt);
});

test("migration retry reuses current-schema UUIDs, preserves the original backup, and clears legacy state",async()=>{
  const currentUuid="keep-this-uuid";
  const originalBackup={createdAt:"2026-01-01T00:00:00.000Z",marker:"original"};
  const settings=new Map([
    [`${MODULE_ID}.${SETTINGS.STATE}`,{schemaVersion:2,revision:4,sets:{[currentUuid]:{uuid:currentUuid,id:"visions-old",legacyIds:["visions-old"],name:"Already migrated",images:["visions/old.webp"]}}}],
    [`${MODULE_ID}.${SETTINGS.LEGACY_VISION_SETS}`,{"visions-old":{id:"visions-old",name:"Old visions",images:["visions/old.webp"]}}],
    [`${MODULE_ID}.${SETTINGS.MIGRATION_COMPLETE}`,false],
    [`${MODULE_ID}.${SETTINGS.MIGRATION_BACKUP}`,originalBackup]
  ]);
  const a=actor("retry",{enabled:true,imageSets:["visions-old"]});
  globalThis.game={user:{isGM:true},actors:[a],scenes:[],settings:{get:(scope,key)=>settings.get(`${scope}.${key}`),set:async(scope,key,value)=>{settings.set(`${scope}.${key}`,structuredClone(value));return value;}}};
  const { WorldRepository }=await import(`../scripts/data/repository.js?retry=${Date.now()}`);
  const repo=new WorldRepository();
  const result=await repo.migrateLegacyData();
  assert.equal(result.migrated,true);
  const state=settings.get(`${MODULE_ID}.${SETTINGS.STATE}`);
  assert.deepEqual(Object.keys(state.sets),[currentUuid]);
  assert.deepEqual(a._flag.visionSetUuids,[currentUuid]);
  assert.deepEqual(settings.get(`${MODULE_ID}.${SETTINGS.MIGRATION_BACKUP}`),originalBackup);
  assert.deepEqual(settings.get(`${MODULE_ID}.${SETTINGS.LEGACY_VISION_SETS}`),{});
  assert.equal(settings.get(`${MODULE_ID}.${SETTINGS.MIGRATION_COMPLETE}`),true);
});

test("legacy migration generates stable set UUIDs across restore-style retries",async()=>{
  const makeSettings=()=>new Map([
    [`${MODULE_ID}.${SETTINGS.STATE}`,{}],
    [`${MODULE_ID}.${SETTINGS.LEGACY_VISION_SETS}`,{"visions-old":{id:"visions-old",name:"Old visions",images:["visions/old.webp"]}}],
    [`${MODULE_ID}.${SETTINGS.MIGRATION_COMPLETE}`,false],
    [`${MODULE_ID}.${SETTINGS.MIGRATION_BACKUP}`,{}]
  ]);
  const { WorldRepository }=await import(`../scripts/data/repository.js?stable=${Date.now()}`);
  const migrate=async settings=>{
    globalThis.game={user:{isGM:true},actors:[],scenes:[],settings:{get:(scope,key)=>settings.get(`${scope}.${key}`),set:async(scope,key,value)=>{settings.set(`${scope}.${key}`,structuredClone(value));return value;}}};
    const repo=new WorldRepository();
    await repo.migrateLegacyData();
    return Object.keys(settings.get(`${MODULE_ID}.${SETTINGS.STATE}`).sets)[0];
  };
  const first=await migrate(makeSettings());
  const second=await migrate(makeSettings());
  assert.equal(first,second);
});
