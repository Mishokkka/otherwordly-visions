import test from "node:test";
import assert from "node:assert/strict";

test("RegionDocument events are translated into regionEnter and regionExit triggers",async()=>{
  globalThis.game={system:{id:"forbidden-lands",version:"13.0.5"},user:{id:"p",isGM:false},actors:[]};
  globalThis.canvas={scene:{id:"s"}};
  const { TriggerService }=await import(`../scripts/triggers/trigger-service.js?regions=${Date.now()}`);
  const service=new TriggerService(),calls=[];
  service.fire=async(type,context)=>{calls.push({type,context});return[];};
  const region={id:"r"},token={id:"t",actor:{id:"a"}};
  await service.handleRegionEvent({name:"tokenEnter",region,data:{token},user:{id:"p"}});
  await service.handleRegionEvent({name:"tokenExit",region,data:{token},user:"p"});
  assert.deepEqual(calls.map(row=>row.type),["regionEnter","regionExit"]);
  assert.equal(calls[0].context.regionId,"r");
  assert.equal(calls[0].context.tokenId,"t");
  assert.equal(calls[0].context.actorId,"a");
  assert.equal(calls[1].context.userId,"p");
});

test("direct RegionDocument fallback dispatches after the core event and restores cleanly",async()=>{
  const calls=[];
  class RegionDocument{async _handleEvent(event){calls.push(`core:${event.name}`);return "ok";}}
  globalThis.foundry={documents:{RegionDocument}};
  globalThis.game={system:{id:"forbidden-lands",version:"13.0.5"},user:{id:"p",isGM:false},actors:[],modules:{get(){return null;}},settings:{get(){return true;}}};
  globalThis.canvas={scene:{id:"s"}};
  const { TriggerService }=await import(`../scripts/triggers/trigger-service.js?patch=${Date.now()}`);
  const original=RegionDocument.prototype._handleEvent,service=new TriggerService();
  service.fire=async type=>{calls.push(`trigger:${type}`);return[];};
  assert.equal(service.patchRegionEvents(),"direct-fallback");
  const doc=new RegionDocument();
  const result=await doc._handleEvent({name:"tokenEnter",region:{id:"r"},data:{token:{id:"t"}},user:"p"});
  assert.equal(result,"ok");
  await Promise.resolve();
  assert.deepEqual(calls,["core:tokenEnter","trigger:regionEnter"]);
  service.destroy();
  assert.equal(RegionDocument.prototype._handleEvent,original);
});
