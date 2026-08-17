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
