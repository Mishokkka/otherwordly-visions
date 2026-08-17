import test from "node:test";
import assert from "node:assert/strict";

if(typeof globalThis.requestAnimationFrame!=="function")globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
if(typeof globalThis.cancelAnimationFrame!=="function")globalThis.cancelAnimationFrame=handle=>clearTimeout(handle);

test("viewer token collection returns placeable Tokens and preserves viewer geometry",async()=>{
  const user={id:"p",isGM:false};
  const document={id:"t",uuid:"Scene.s.Token.t",elevation:12,regions:[]};
  const placeable={document,center:{x:150,y:250},actor:null};
  document.object=placeable;
  const actor={id:"a",getFlag(){return{enabled:true,rank:1,tags:[],visionSetUuids:[],revelations:{}};},testUserPermission(){return true;},getActiveTokens(linked,documents){assert.equal(linked,true);assert.equal(documents,false);return[placeable];}};
  placeable.actor=actor;
  globalThis.game={user,actors:[actor],users:{get(){return null;}}};
  globalThis.canvas={tokens:{controlled:[],placeables:[placeable]},scene:{id:"s",darkness:0,grid:{distance:1}},grid:{size:100,measurePath(){return{distance:1};}}};
  globalThis.CONFIG={Canvas:{polygonBackends:{sight:{testCollision(){return false;}}}}};
  const { VisibilityService }=await import(`../scripts/visibility/visibility-service.js?viewers=${Date.now()}`);
  const service=new VisibilityService();
  const viewers=service.collectViewerTokens(user);
  assert.deepEqual(viewers,[placeable]);
  assert.equal(service.conditionMatch({type:"viewerElevation",operator:"greaterOrEqual",value:10},{actor,token:document,user}),true);
  assert.equal(service.measureDistance(viewers[0],{center:{x:250,y:250}}),1);
  assert.equal(service.hasLineOfSight(viewers[0],{center:{x:250,y:250}}),true);
});
