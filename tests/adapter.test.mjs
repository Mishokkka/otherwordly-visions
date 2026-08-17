import test from "node:test";
import assert from "node:assert/strict";

test("Forbidden Lands adapter recognizes system-specific chat signals",async()=>{
  globalThis.game={system:{id:"forbidden-lands",version:"13.0.5"}};
  const { ForbiddenLandsAdapter }=await import("../scripts/adapters/forbidden-lands.js");
  const adapter=new ForbiddenLandsAdapter();
  const events=adapter.analyzeChatMessage({id:"m",flags:{"forbidden-lands":{banes:2}},flavor:"Pushed roll with banes 2",content:"critical injury",rolls:[]});
  const types=events.map(event=>event.type);
  assert.ok(types.includes("fblPush"));
  assert.ok(types.includes("fblBane"));
  assert.ok(types.includes("fblCritical"));
  assert.equal(events.find(event=>event.type==="fblBane").banes,2);
});

test("Forbidden Lands adapter emits fblDamage when a tracked attribute is reduced",async()=>{
  globalThis.game={system:{id:"forbidden-lands",version:"13.0.5"},actors:[]};
  const { ForbiddenLandsAdapter }=await import(`../scripts/adapters/forbidden-lands.js?damage=${Date.now()}`);
  const actor={id:"a",system:{attribute:{strength:{value:4},agility:{value:3},wits:{value:2},empathy:{value:5}}}};
  const adapter=new ForbiddenLandsAdapter();
  adapter.primeActor(actor);
  actor.system.attribute.strength.value=2;
  const events=adapter.analyzeActorUpdate(actor,{system:{attribute:{strength:{value:2}}}});
  const damage=events.find(event=>event.type==="fblDamage");
  assert.ok(damage);
  assert.equal(damage.attribute,"strength");
  assert.equal(damage.previous,4);
  assert.equal(damage.value,2);
  assert.equal(damage.damage,2);
  assert.ok(events.some(event=>event.type==="fblCondition"));
});

test("Forbidden Lands adapter accepts flattened dotted update paths",async()=>{
  globalThis.game={system:{id:"forbidden-lands",version:"13.0.5"},actors:[]};
  const { ForbiddenLandsAdapter }=await import(`../scripts/adapters/forbidden-lands.js?dotted=${Date.now()}`);
  const actor={id:"flat",system:{attribute:{strength:{value:5},agility:{value:3},wits:{value:2},empathy:{value:4}}}};
  const adapter=new ForbiddenLandsAdapter();
  adapter.primeActor(actor);
  actor.system.attribute.strength.value=3;
  const events=adapter.analyzeActorUpdate(actor,{"system.attribute.strength.value":3});
  const damage=events.find(event=>event.type==="fblDamage");
  assert.ok(damage);
  assert.equal(damage.attribute,"strength");
  assert.equal(damage.damage,2);
  assert.ok(events.some(event=>event.type==="fblCondition"));
});
