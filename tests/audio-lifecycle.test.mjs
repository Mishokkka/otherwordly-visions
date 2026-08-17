import test from "node:test";
import assert from "node:assert/strict";

const settings={
  playerFlashEnabled:true,
  volumeCap:1,
  opacityCap:1,
  reducedMotion:false,
  photosensitiveMode:false,
  blockedSafetyTags:[],
  allowHiddenTabPlayback:true,
  minimumCueInterval:0,
  emergencyMute:false
};
globalThis.game={settings:{get(_module,key){return settings[key];}}};

const sounds=[];
globalThis.foundry={audio:{AudioHelper:{async play({src}){
  const listeners=new Map();
  const sound={src,stops:0,once(event,callback){listeners.set(event,callback);},async stop(){this.stops++;listeners.get("stop")?.();}};
  sounds.push(sound);
  return sound;
}}}};

const { AudioChannel }=await import(`../scripts/visions/overlay.js?audio-test=${Date.now()}`);

test("vision audio outlives cue abort and only Stop All ends active sounds",async()=>{
  const channel=new AudioChannel();
  const controller=new AbortController();
  const first=await channel.play("first.mp3",0.5,controller.signal);
  controller.abort("image-ended");
  assert.equal(first.stops,0);
  assert.equal(channel.active.size,1);

  const second=await channel.play("second.mp3",0.5,new AbortController().signal);
  assert.equal(first.stops,0);
  assert.equal(second.stops,0);
  assert.equal(channel.active.size,2);

  await channel.stop();
  assert.equal(first.stops,1);
  assert.equal(second.stops,1);
  assert.equal(channel.active.size,0);
});
