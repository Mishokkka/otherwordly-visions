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
