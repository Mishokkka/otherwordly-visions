import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, SETTINGS } from "../scripts/constants.js";

test("command bus rejects non-GM issuers and addresses valid envelopes",async()=>{
  globalThis.Hooks={callAll(){},call(){return true;}};
  globalThis.canvas={scene:{id:"s",tokens:{contents:[]}}};
  const settingValues=new Map([[SETTINGS.SESSION_LOG,[]]]);
  const users=new Map([["gm",{id:"gm",isGM:true}],["bad",{id:"bad",isGM:false}],["p",{id:"p",isGM:false}]]);
  globalThis.game={user:{id:"p",isGM:false,async setFlag(){}},users:{get:id=>users.get(id)},settings:{get(_scope,key){return settingValues.get(key);},async set(_scope,key,value){settingValues.set(key,value);return value;}},playlists:new Map()};
  const { CommandBus }=await import("../scripts/commands/command-bus.js");
  const bus=new CommandBus(),now=Date.now();
  await bus.receive({id:"evil",type:"stopAll",issuerId:"bad",recipients:["p"],issuedAt:now,expiresAt:now+1000,payload:{}});
  assert.equal(bus.errors.at(-1).reason,"non-gm-issuer");
  await bus.receive({id:"other",type:"stopAll",issuerId:"gm",recipients:["someone-else"],issuedAt:now,expiresAt:now+1000,payload:{}});
  assert.equal(bus.lastCommand,null);
  await bus.receive({id:"valid",type:"stopAll",issuerId:"gm",recipients:["p"],issuedAt:now,expiresAt:now+1000,payload:{}});
  assert.equal(bus.lastCommand.id,"valid");
  assert.equal(bus.processed.has("valid"),true);
});

test("GM dispatch writes a bounded, expiring command envelope",async()=>{
  let written;
  globalThis.game={user:{id:"gm",isGM:true},settings:{async set(scope,key,value){assert.equal(scope,MODULE_ID);if(key===SETTINGS.COMMAND)written=value;else assert.equal(key,SETTINGS.SESSION_LOG);return value;},get(){return[];}}};
  const { CommandBus }=await import(`../scripts/commands/command-bus.js?dispatch=${Date.now()}`);
  const bus=new CommandBus();
  const envelope=await bus.dispatch("stopAll",{},["p"],{ttlMs:5000});
  assert.equal(written.id,envelope.id);
  assert.equal(envelope.issuerId,"gm");
  assert.deepEqual(envelope.recipients,["p"]);
  assert.ok(envelope.expiresAt>envelope.issuedAt);
});

test("command bus rejects empty recipient lists and never treats them as broadcast",async()=>{
  globalThis.Hooks={callAll(){},call(){return true;}};
  globalThis.canvas={scene:{id:"s",tokens:{contents:[]}}};
  const values=new Map([[SETTINGS.SESSION_LOG,[]]]);
  const users=new Map([["gm",{id:"gm",isGM:true}],["p",{id:"p",isGM:false}]]);
  globalThis.game={user:{id:"gm",isGM:true,async setFlag(){}},users:{get:id=>users.get(id)},settings:{get(_scope,key){return values.get(key);},async set(_scope,key,value){values.set(key,value);return value;}},playlists:new Map()};
  const { CommandBus }=await import(`../scripts/commands/command-bus.js?empty=${Date.now()}`);
  const bus=new CommandBus();
  await assert.rejects(()=>bus.dispatch("stopAll",{},[]),/recipient/i);

  game.user={id:"p",isGM:false,async setFlag(){}};
  const now=Date.now();
  await bus.receive({id:"empty",type:"stopAll",issuerId:"gm",recipients:[],issuedAt:now,expiresAt:now+1000,payload:{}});
  assert.equal(bus.lastCommand,null);
});
