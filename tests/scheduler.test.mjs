import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, SETTINGS } from "../scripts/constants.js";

test("repeated reconciliation leaves one timer per eligible set",async()=>{
  const state={schemaVersion:2,revision:1,sets:{u:{uuid:"u",name:"Set",enabled:true,images:["a.webp"],audio:[],entries:[],sequence:[],playlistIds:[],triggers:[],minDelay:10,maxDelay:10,chance:1,minOpacity:.2,maxOpacity:.4,minDuration:100,maxDuration:200,audioChance:1,minVolume:.4,maxVolume:.7,minScale:1,maxScale:1,minRotation:0,maxRotation:0,maxBlur:0,blendMode:"screen",fitMode:"contain",edgeFade:true,edgeFadeSize:12,vignette:true,safety:[],cooldown:0,maxPerSession:0,noRepeatWindow:2,legacyIds:[],slug:"set"}}};
  const actor={id:"a",getFlag:()=>({enabled:true,rank:1,tags:[],visionSetUuids:["u"],revelations:{}}),testUserPermission:()=>true};
  globalThis.document={hidden:false};
  globalThis.window={setTimeout,clearTimeout};
  globalThis.Hooks={callAll(){}};
  globalThis.game={user:{id:"p",isGM:false,character:actor},actors:[actor],playlists:new Map(),settings:{get(_scope,key){if(key===SETTINGS.STATE)return state;if(key===SETTINGS.FLASH_ENABLED||key===SETTINGS.PLAYER_FLASH)return true;if(key===SETTINGS.ALLOW_HIDDEN)return false;return 0;}}};
  const { mediaCache }=await import("../scripts/visions/media-cache.js");
  mediaCache.prewarm=()=>{};
  const { VisionScheduler }=await import("../scripts/visions/scheduler.js");
  const scheduler=new VisionScheduler();
  for(let i=0;i<100;i++)scheduler.reconcile();
  assert.equal(scheduler.jobs.size,1);
  assert.equal(scheduler.generation,100);
  assert.equal([...scheduler.jobs.values()][0].generation,100);
  scheduler.stopAll();
  assert.equal(scheduler.jobs.size,0);
});
