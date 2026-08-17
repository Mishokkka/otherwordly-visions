import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOtherworldly, normalizeTouched, normalizeVisionSet } from "../scripts/data/schemas.js";

test("legacy actor imageSets migrate without being shadowed by defaults",()=>{
  const touched=normalizeTouched({enabled:true,rank:3,imageSets:["old-a","old-b"]});
  assert.deepEqual(touched.visionSetUuids,["old-a","old-b"]);
  assert.equal("imageSets" in touched,false);
});

test("vision sets receive stable normalized fields and clamps",()=>{
  const set=normalizeVisionSet({id:"Old ID",name:"Night Terrors",images:["a.webp","bad.txt","a.webp"],audio:["x.ogg"],minDelay:40,maxDelay:2,minOpacity:2,maxOpacity:-1,entries:[{image:"a.webp",weight:0}],triggers:[{type:"sceneReady",chance:4}]});
  assert.ok(set.uuid.length>=8);
  assert.ok(set.legacyIds.includes("Old ID"));
  assert.equal(set.slug,"old-id");
  assert.deepEqual(set.images,["a.webp"]);
  assert.equal(set.maxDelay,set.minDelay);
  assert.equal(set.maxOpacity,set.minOpacity);
  assert.equal(set.entries[0].weight,.01);
  assert.equal(set.triggers[0].chance,1);
});

test("otherworldly condition AST is normalized without executable code",()=>{
  const token=normalizeOtherworldly({requiredRank:99,minDarkness:.8,maxDarkness:.2,conditions:[{type:"actorProperty",operator:"greater",path:"system.attributes.wits.value",value:"3",script:"alert(1)"}]});
  assert.equal(token.requiredRank,20);
  assert.equal(token.maxDarkness,.8);
  assert.equal(token.conditions[0].type,"actorProperty");
  assert.equal(token.conditions[0].path,"system.attributes.wits.value");
  assert.equal("script" in token.conditions[0],false);
});
