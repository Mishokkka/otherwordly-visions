import { MODULE_ID, SETTINGS } from "../constants.js";
import { repository } from "../data/repository.js";
import { documentKey, warn } from "../utils.js";
import { visibilityService } from "./visibility-service.js";

export class TokenEffects {
  constructor(){ this.states=new Map(); this.sceneLayerEnabled=false; }
  signature(data,result){
    let cap=1; try{ cap=Number(game.settings.get(MODULE_ID,SETTINGS.OPACITY_CAP)??1); }catch(_error){}
    return JSON.stringify({enabled:data.enabled,mode:data.visualEffect,intensity:data.effectIntensity,opacity:data.viewerOpacity,stage:result.stage,canSee:result.canSee,fullGhost:data.fullGhost,suppressLight:data.suppressLight,suppressVision:data.suppressVision,layer:this.sceneLayerEnabled,cap});
  }
  reconcile(token,evaluation=null){
    if(!token?.document)return;
    const key=documentKey(token.document), result=evaluation??visibilityService.evaluate(token.document), data=result?.data??repository.getOtherworldly(token.document), signature=this.signature(data,result), existing=this.states.get(key);
    if(existing?.signature===signature)return;
    this.remove(token.document);
    if(!data.enabled)return;
    const state={signature,graphics:null,filters:[],originalEventMode:token.eventMode,originalCursor:token.cursor,originalMeshAlpha:token.mesh?.alpha,originalFilters:token.mesh?.filters ? [...token.mesh.filters] : token.mesh?.filters,lightActive:token.lightSource?.active,visionActive:token.visionSource?.active};
    const visible=result.canSee, interactive=visible&&(!data.fullGhost||result.stage>=4);
    try{ token.eventMode=interactive?state.originalEventMode:"none"; token.cursor=visible?state.originalCursor:"default"; }catch(_error){}
    if(data.suppressLight&&token.lightSource){ try{ token.lightSource.active=visible; }catch(error){ warn("Unable to suppress token light source",error); } }
    if(data.suppressVision&&token.visionSource){ try{ token.visionSource.active=visible; }catch(error){ warn("Unable to suppress token vision source",error); } }
    const mesh=token.mesh;
    if(mesh){
      let cap=1; try{ cap=Number(game.settings.get(MODULE_ID,SETTINGS.OPACITY_CAP)??1); }catch(_error){}
      const stageOpacity=result.stage===1?.18:result.stage===2?.4:result.stage===3?.72:1;
      mesh.alpha=visible?Math.min(data.viewerOpacity,cap)*stageOpacity:0;
      if(visible&&data.visualEffect!=="none"){
        const filters=[];
        if(globalThis.PIXI?.BlurFilter&&["warp","spectral"].includes(data.visualEffect)){
          let blur;
          try{ blur=new PIXI.BlurFilter({strength:data.effectIntensity*(data.visualEffect==="warp"?3:1.2),quality:2}); }
          catch(_error){ blur=new PIXI.BlurFilter(data.effectIntensity*(data.visualEffect==="warp"?3:1.2),2); }
          filters.push(blur);
        }
        mesh.filters=[...(state.originalFilters??[]),...filters]; state.filters=filters;
      }
    }
    if(globalThis.PIXI?.Graphics&&(visible||this.sceneLayerEnabled)){
      const g=new PIXI.Graphics(), width=Math.max(24,Number(token.w??token.width??100)), height=Math.max(24,Number(token.h??token.height??100));
      const color=this.sceneLayerEnabled?0x8b73ff:data.visualEffect==="spectral"?0x76e7ff:0x7a5cff, alpha=this.sceneLayerEnabled?.9:.55, lineWidth=this.sceneLayerEnabled?3:2;
      try{
        if(typeof g.rect==="function"&&typeof g.stroke==="function") g.rect(2,2,width-4,height-4).stroke({width:lineWidth,color,alpha});
        else { g.lineStyle(lineWidth,color,alpha); g.drawRoundedRect(2,2,width-4,height-4,10); }
        g.eventMode="none"; token.addChild(g); state.graphics=g;
      }catch(error){ warn("Token outline effect failed",error); g.destroy?.(); }
    }
    this.states.set(key,state);
  }
  remove(tokenOrDocument){
    const document=tokenOrDocument?.document??tokenOrDocument, key=documentKey(document), state=this.states.get(key), token=document?.object;
    if(!state)return;
    try{ state.graphics?.destroy?.({children:true}); }catch(_error){}
    for(const filter of state.filters??[])try{filter?.destroy?.();}catch(_error){}
    if(token){
      try{ token.eventMode=state.originalEventMode; token.cursor=state.originalCursor; }catch(_error){}
      if(token.mesh){ try{ token.mesh.alpha=state.originalMeshAlpha??Number(document?.alpha??1); token.mesh.filters=state.originalFilters??null; }catch(_error){} }
      if(token.lightSource&&state.lightActive!==undefined){ try{ token.lightSource.active=state.lightActive; }catch(_error){} }
      if(token.visionSource&&state.visionActive!==undefined){ try{ token.visionSource.active=state.visionActive; }catch(_error){} }
    }
    this.states.delete(key);
  }
  hasState(tokenOrDocument){const document=tokenOrDocument?.document??tokenOrDocument;return Boolean(document&&this.states.has(documentKey(document)));}
  clear(){ for(const token of canvas?.tokens?.placeables??[])this.remove(token.document); this.states.clear(); }
  refreshAll(){ for(const document of visibilityService.getOtherworldlyDocuments()){const token=document.object??canvas?.tokens?.get?.(document.id);if(token)this.reconcile(token);} }
  setSceneLayerEnabled(enabled){ this.sceneLayerEnabled=Boolean(enabled); this.refreshAll(); }
  snapshot(){ return{effects:this.states.size,sceneLayerEnabled:this.sceneLayerEnabled}; }
}
export const tokenEffects=new TokenEffects();
