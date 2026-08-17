import { MODULE_ID, SETTINGS } from "../constants.js";
import { repository } from "../data/repository.js";
import { clampNumber, debounceFrame, documentKey, getProperty, randomBetween, warn } from "../utils.js";

class ViewerProfileCache {
  constructor(){this.cache=new Map();}
  invalidate(userId=null){if(userId)this.cache.delete(userId);else this.cache.clear();}
  get size(){return this.cache.size;}
  get(user=game.user){
    if(!user)return{user:null,actors:[]};const cached=this.cache.get(user.id);if(cached)return cached;
    const actors=[];if(user.character)actors.push(user.character);for(const actor of game.actors??[])if((actor.testUserPermission?.(user,"OWNER")??false)&&!actors.some(item=>item.id===actor.id))actors.push(actor);
    const profile={user,actors:actors.map(actor=>({actor,touched:repository.getTouched(actor)}))};this.cache.set(user.id,profile);return profile;
  }
}

class ManifestationClock {
  constructor(){this.states=new Map();this.onChange=()=>{};}
  setOnChange(callback){this.onChange=callback??(()=>{});}
  clear(){for(const state of this.states.values()){clearTimeout(state.openTimer);clearTimeout(state.closeTimer);}this.states.clear();}
  remove(key){const state=this.states.get(key);if(!state)return;clearTimeout(state.openTimer);clearTimeout(state.closeTimer);this.states.delete(key);}
  isVisible(key,data){let state=this.states.get(key);if(!state){state={visible:false,openTimer:null,closeTimer:null};this.states.set(key,state);this.scheduleOpen(key,data,state);}return state.visible;}
  force(key,durationMs=2000){const state=this.states.get(key)??{visible:false,openTimer:null,closeTimer:null};this.states.set(key,state);clearTimeout(state.openTimer);clearTimeout(state.closeTimer);state.visible=true;this.onChange(key);state.closeTimer=window.setTimeout(()=>{state.visible=false;this.onChange(key);this.scheduleOpen(key,repository.getOtherworldly(this.resolve(key)),state);},Math.max(100,durationMs));}
  resolve(key){return canvas?.tokens?.placeables?.find(token=>documentKey(token.document)===key)?.document??null;}
  scheduleOpen(key,data,state){clearTimeout(state.openTimer);state.openTimer=window.setTimeout(()=>{state.visible=true;this.onChange(key);state.closeTimer=window.setTimeout(()=>{state.visible=false;this.onChange(key);this.scheduleOpen(key,data,state);},clampNumber(data?.intermittentDuration,.1,60,1.5)*1000);},randomBetween(data?.intermittentMinDelay??5,data?.intermittentMaxDelay??14)*1000);}
}

export class VisibilityService {
  constructor(){this.profileCache=new ViewerProfileCache();this.manifestations=new ManifestationClock();this.manifestations.setOnChange(key=>{const token=canvas?.tokens?.placeables?.find(item=>documentKey(item.document)===key);if(token)this.refreshToken(token);});this.previewUserId=null;this.sceneReadyAt=Date.now();this.cuesSeen=new Set();this.patchMode="uninitialized";this.wrapperPaths=[];this.directPatch=null;this.listeners=new Set();this.batchViewerTokens=null;this.batchViewerUserId=null;this.refreshAllDebounced=debounceFrame(()=>this.refreshAll());}
  onChange(callback){this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  markSceneReady(){this.sceneReadyAt=Date.now();this.manifestations.clear();}
  markCueSeen(cue){if(cue?.setUuid)this.cuesSeen.add(cue.setUuid);}
  resetSessionMemory(){this.cuesSeen.clear();this.manifestations.clear();}
  setPreviewUser(userId){this.previewUserId=userId||null;this.profileCache.invalidate();this.refreshAll();}
  get viewer(){return this.previewUserId?game.users?.get(this.previewUserId)??game.user:game.user;}
  viewerTokens(user=this.viewer){
    if(this.batchViewerTokens&&this.batchViewerUserId===(user?.id??null))return this.batchViewerTokens;
    return this.collectViewerTokens(user);
  }
  collectViewerTokens(user=this.viewer){
    const tokens=[];for(const controlled of canvas?.tokens?.controlled??[])if(!user||controlled.actor?.testUserPermission?.(user,"OWNER"))tokens.push(controlled);
    if(tokens.length)return tokens;const profile=this.profileCache.get(user);for(const row of profile.actors)for(const token of row.actor.getActiveTokens?.(true,true)??[])if(!tokens.includes(token))tokens.push(token);return tokens;
  }
  actorEligibility(actor,tokenDocument,data,user=this.viewer){
    const touched=repository.getTouched(actor);const reasons=[];if(!touched.enabled)reasons.push("not-touched");if(touched.rank<data.requiredRank)reasons.push("rank");if(data.requiredTags.some(tag=>!touched.tags.includes(tag)))reasons.push("tags");
    const conditionOk=this.conditionsMatch(data.conditions,{actor,touched,token:tokenDocument,user});if(!conditionOk)reasons.push("conditions");
    const revelation=clampNumber(touched.revelations?.[tokenDocument.uuid],0,5,0);const stage=Math.max(data.revealStage,revelation);return{actor,touched,eligible:reasons.length===0,reasons,stage,revelation};
  }
  evaluateForActor(tokenOrDocument,actor,user=this.viewer){const document=tokenOrDocument?.document??tokenOrDocument;const data=repository.getOtherworldly(document);if(!data.enabled)return{canSee:true,stage:5,reasons:["ordinary"],data,actorResults:[]};const row=this.actorEligibility(actor,document,data,user);let canSee=row.eligible&&row.stage>0;if(canSee&&row.stage===3)canSee=this.manifestations.isVisible(documentKey(document),data);const spatial=this.spatialMatch(document,data,user);if(!spatial.ok){canSee=false;row.reasons.push(...spatial.reasons);}return{canSee,stage:canSee?row.stage:0,reasons:row.reasons,data,actorResults:[row]};}
  evaluate(tokenOrDocument,user=this.viewer){
    const document=tokenOrDocument?.document??tokenOrDocument;if(!document)return{canSee:false,stage:0,reasons:["missing-token"],data:null,actorResults:[]};const data=repository.getOtherworldly(document);if(!data.enabled)return{canSee:true,stage:5,reasons:["ordinary"],data,actorResults:[]};
    if(user?.isGM&&!this.previewUserId)return{canSee:true,stage:5,reasons:["gm"],data,actorResults:[]};
    const profile=this.profileCache.get(user);const actorResults=profile.actors.map(row=>this.actorEligibility(row.actor,document,data,user));const eligible=actorResults.filter(row=>row.eligible);const stage=eligible.reduce((max,row)=>Math.max(max,row.stage),0);const reasons=[];if(!eligible.length)reasons.push(...new Set(actorResults.flatMap(row=>row.reasons)));const spatial=this.spatialMatch(document,data,user);if(!spatial.ok)reasons.push(...spatial.reasons);
    let canSee=eligible.length>0&&stage>0&&spatial.ok;if(canSee&&stage===3)canSee=this.manifestations.isVisible(documentKey(document),data);return{canSee,stage:canSee?stage:0,reasons:reasons.length?reasons:[canSee?"eligible":"hidden"],data,actorResults};
  }
  spatialMatch(document,data,user){
    const reasons=[];const darkness=Number(canvas?.scene?.darkness??0);if(darkness<data.minDarkness||darkness>data.maxDarkness)reasons.push("darkness");
    const target=document.object??canvas?.tokens?.get?.(document.id);const viewers=this.viewerTokens(user);
    if((data.maxDistance>0||data.requireLineOfSight)&&target&&!viewers.length)reasons.push("no-viewer-token");
    if(data.maxDistance>0&&target&&viewers.length){const nearest=Math.min(...viewers.map(viewer=>this.measureDistance(viewer,target)));if(nearest>data.maxDistance)reasons.push("distance");}
    if(data.requireLineOfSight&&target&&viewers.length){const visible=viewers.some(viewer=>this.hasLineOfSight(viewer,target));if(!visible)reasons.push("line-of-sight");}
    return{ok:reasons.length===0,reasons};
  }
  measureDistance(a,b){try{const origin=a.center??{x:a.x,y:a.y},destination=b.center??{x:b.x,y:b.y};const measured=canvas?.grid?.measurePath?.([origin,destination]);if(Number.isFinite(measured?.distance))return measured.distance;const pixels=Math.hypot(destination.x-origin.x,destination.y-origin.y);return pixels/Math.max(1,Number(canvas?.grid?.size??100))*Number(canvas?.scene?.grid?.distance??1);}catch(_error){return Infinity;}}
  hasLineOfSight(viewer,target){try{const backend=CONFIG?.Canvas?.polygonBackends?.sight;return backend?.testCollision?!backend.testCollision(viewer.center,target.center,{type:"sight",mode:"any"}):true;}catch(_error){return true;}}
  tokenRegions(document){return new Set((document?.regions??document?.object?.regions??[]).map(region=>region.id));}
  viewerRegions(user){const set=new Set();for(const token of this.viewerTokens(user))for(const region of token.document?.regions??token.regions??[])set.add(region.id);return set;}
  conditionsMatch(conditions,context){return(conditions??[]).filter(c=>c.enabled!==false).every(condition=>this.conditionMatch(condition,context));}
  conditionMatch(condition,{actor,token,user}){
    let actual;switch(condition.type){case"scene":actual=canvas?.scene?.id;break;case"targetRegion":actual=[...this.tokenRegions(token)];break;case"viewerRegion":actual=[...this.viewerRegions(user)];break;case"targetElevation":actual=Number(token?.elevation??0);break;case"viewerElevation":actual=Math.max(...this.viewerTokens(user).map(t=>Number(t.document?.elevation??0)),0);break;case"actorProperty":actual=getProperty(actor,condition.path);break;case"user":actual=user?.id;break;case"timeOnScene":actual=(Date.now()-this.sceneReadyAt)/1000;break;case"cueShown":actual=[...this.cuesSeen];break;default:return false;}
    const expected=condition.value,op=condition.operator;if(op==="in")return Array.isArray(actual)?actual.some(v=>(expected??[]).includes(String(v))):(expected??[]).includes(String(actual));if(op==="notIn")return Array.isArray(actual)?actual.every(v=>!(expected??[]).includes(String(v))):!(expected??[]).includes(String(actual));if(op==="equals")return String(actual)===String(expected);if(op==="notEquals")return String(actual)!==String(expected);if(op==="contains")return String(actual??"").toLowerCase().includes(String(expected??"").toLowerCase());const left=Number(actual),right=Number(expected);if(!Number.isFinite(left)||!Number.isFinite(right))return false;return op==="greater"?left>right:op==="greaterOrEqual"?left>=right:op==="less"?left<right:left<=right;
  }
  canCurrentUserSee(token){return this.evaluate(token).canSee;}
  notifyListeners(token=null,evaluation=null){for(const callback of this.listeners)try{callback(token,evaluation);}catch(error){warn("Visibility listener failed",error);}}
  refreshToken(token,{notify=true}={}){if(!token)return;try{const evaluation=this.evaluate(token);token.renderFlags?.set?.({refreshVisibility:true,refreshState:true,refreshMesh:true});token.refresh?.();if(notify)this.notifyListeners(token,evaluation);Hooks.callAll(`${MODULE_ID}.visibilityChanged`,token,evaluation);}catch(error){warn("Token visibility refresh failed",error);}}
  refreshAll(){const user=this.viewer;this.batchViewerUserId=user?.id??null;this.batchViewerTokens=this.collectViewerTokens(user);try{for(const token of canvas?.tokens?.placeables??[])this.refreshToken(token,{notify:false});}finally{this.batchViewerTokens=null;this.batchViewerUserId=null;}this.notifyListeners();}
  removeToken(tokenOrDocument){const document=tokenOrDocument?.document??tokenOrDocument;if(document)this.manifestations.remove(documentKey(document));}
  forceManifest(tokenOrDocument,durationMs=2000){const document=tokenOrDocument?.document??tokenOrDocument;if(!document)return;this.manifestations.force(documentKey(document),durationMs);this.refreshToken(document.object);}
  wrapper(wrapped,...args){const original=wrapped(...args);const data=repository.getOtherworldly(this.document);if(!data.enabled)return original;return original&&visibilityService.canCurrentUserSee(this.document);}
  patchTokenVisibility(){
    const proto=globalThis.foundry?.canvas?.placeables?.Token?.prototype??globalThis.Token?.prototype;if(!proto){this.patchMode="unavailable";return this.patchMode;}
    if(game.modules?.get("lib-wrapper")?.active&&globalThis.libWrapper){try{libWrapper.register(MODULE_ID,"foundry.canvas.placeables.Token.prototype.isVisible",function(wrapped,...args){const original=wrapped(...args);const data=repository.getOtherworldly(this.document);return data.enabled?original&&visibilityService.canCurrentUserSee(this.document):original;},"WRAPPER");this.wrapperPaths.push("foundry.canvas.placeables.Token.prototype.isVisible");this.patchMode="libWrapper";return this.patchMode;}catch(error){warn("libWrapper patch failed",error);}}
    if(!game.settings.get(MODULE_ID,SETTINGS.DIRECT_FALLBACK)){this.patchMode="unavailable";return this.patchMode;}
    const descriptor=Object.getOwnPropertyDescriptor(proto,"isVisible");if(!descriptor?.get){this.patchMode="failed";return this.patchMode;}this.directPatch={proto,descriptor};Object.defineProperty(proto,"isVisible",{...descriptor,get(){const original=descriptor.get.call(this);const data=repository.getOtherworldly(this.document);return data.enabled?original&&visibilityService.canCurrentUserSee(this.document):original;}});this.patchMode="direct-fallback";return this.patchMode;
  }
  destroy(){this.manifestations.clear();for(const path of this.wrapperPaths)try{libWrapper.unregister(MODULE_ID,path);}catch(_error){}this.wrapperPaths=[];if(this.directPatch)Object.defineProperty(this.directPatch.proto,"isVisible",this.directPatch.descriptor);this.directPatch=null;this.patchMode="destroyed";}
  healthSnapshot(){return{mode:this.patchMode,previewUserId:this.previewUserId,profileCache:this.profileCache.size,cuesSeen:this.cuesSeen.size};}
}
export const visibilityService=new VisibilityService();
