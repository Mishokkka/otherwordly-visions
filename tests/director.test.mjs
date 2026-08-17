import test from "node:test";
import assert from "node:assert/strict";

test("Director replace policy cancels current cue and resolves both promises",async()=>{
  globalThis.Hooks={callAll(){},call(){return true;}};
  globalThis.game={playlists:new Map()};
  const { VisionDirector }=await import("../scripts/visions/director.js");
  const director=new VisionDirector();
  director.runCue=(cue,signal)=>new Promise(resolve=>{const timer=setTimeout(()=>resolve({status:"shown",id:cue.id}),cue.id==="first"?80:5);signal.addEventListener("abort",()=>{clearTimeout(timer);resolve({status:"cancelled"});},{once:true});});
  const first=director.enqueueCue({id:"first",setUuid:null,setName:"First",source:"test",priority:10,conflict:"queue",createdAt:1,payload:{},metadata:{}});
  await new Promise(resolve=>setTimeout(resolve,5));
  const second=director.enqueueCue({id:"second",setUuid:null,setName:"Second",source:"test",priority:20,conflict:"replace",createdAt:2,payload:{},metadata:{}});
  assert.equal((await first).status,"cancelled");
  assert.equal((await second).status,"shown");
  assert.equal(director.history.length,2);
});


test("Director includes tracks from selected Foundry playlists in the randomized audio pool",async()=>{
  globalThis.Hooks={callAll(){},call(){return true;}};
  globalThis.game={playlists:new Map([["playlist-1",{sounds:{contents:[{path:"sounds/from-playlist.ogg"}]}}]])};
  const { VisionDirector }=await import("../scripts/visions/director.js");
  const director=new VisionDirector();
  const payload=director.buildPayload({
    audio:[],playlistIds:["playlist-1"],audioChance:1,images:[],safety:[],
    minDuration:100,maxDuration:100,minOpacity:.5,maxOpacity:.5,minVolume:.5,maxVolume:.5,
    minScale:1,maxScale:1,minRotation:0,maxRotation:0,maxBlur:0,blendMode:"screen",fitMode:"cover",edgeFade:false,edgeFadeSize:0,vignette:false
  },{});
  assert.equal(payload.audio,"sounds/from-playlist.ogg");
});
