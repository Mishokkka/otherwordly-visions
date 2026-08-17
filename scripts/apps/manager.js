import { AUDIO_EXTENSIONS, CONFLICT, DEFAULT_ENTRY, DEFAULT_SEQUENCE_STEP, DEFAULT_TRIGGER, FILEPICKER_SOURCES, IMAGE_EXTENSIONS, MODULE_ID, MODULE_VERSION, PRIORITY, SETTINGS } from "../constants.js";
import { commandBus } from "../commands/command-bus.js";
import { repository, RevisionConflictError } from "../data/repository.js";
import { normalizeEntry, normalizeOtherworldly, normalizeSequenceStep, normalizeTrigger, normalizeVisionSet } from "../data/schemas.js";
import { applyWindowChrome, assetCandidates, assetName, confirmDialog, clone, downloadJson, isAudioPath, isImagePath, parsePathList, randomId, slugify, unique, warn } from "../utils.js";
import { triggerService } from "../triggers/trigger-service.js";
import { director } from "../visions/director.js";
import { mediaCache } from "../visions/media-cache.js";
import { scheduler } from "../visions/scheduler.js";
import { tokenEffects } from "../visibility/token-effects.js";
import { visibilityService } from "../visibility/visibility-service.js";
import { openActorEditor, openTokenEditor } from "./editors.js";

let managerInstance=null;
const SET_PRESETS={
  subtle:{name:"OV.Preset.Subtle",patch:{minDelay:90,maxDelay:300,chance:.22,minOpacity:.12,maxOpacity:.32,minDuration:180,maxDuration:700,minScale:1,maxScale:1.03,maxBlur:.35,blendMode:"screen",edgeFade:true,vignette:true}},
  shock:{name:"OV.Preset.Shock",patch:{minDelay:20,maxDelay:90,chance:.55,minOpacity:.55,maxOpacity:.9,minDuration:70,maxDuration:220,minScale:1.02,maxScale:1.12,maxBlur:1.4,blendMode:"difference",edgeFade:true,vignette:true}},
  cinematic:{name:"OV.Preset.Cinematic",patch:{minDelay:120,maxDelay:420,chance:.3,minOpacity:.28,maxOpacity:.7,minDuration:600,maxDuration:1800,minScale:1,maxScale:1.04,maxBlur:.25,blendMode:"normal",fitMode:"contain",edgeFade:true,vignette:true}}
};
const TOKEN_PRESETS={
  absolute:{name:"OV.TokenPreset.Absolute",patch:{enabled:true,revealStage:4,fullGhost:true,suppressLight:true,suppressVision:true,hideCombatant:true,maxDistance:0,requireLineOfSight:false}},
  proximity:{name:"OV.TokenPreset.Proximity",patch:{enabled:true,revealStage:4,fullGhost:true,suppressLight:true,suppressVision:true,maxDistance:12,requireLineOfSight:true}},
  intermittent:{name:"OV.TokenPreset.Intermittent",patch:{enabled:true,revealStage:3,intermittentMinDelay:4,intermittentMaxDelay:12,intermittentDuration:1.5,suppressLight:true,suppressVision:true}}
};

function notify(type,key,data={}){ui.notifications?.[type]?.(game.i18n.format(key,data));}
function value(root,name,fallback=""){return root?.querySelector(`[name="${name}"]`)?.value??fallback;}
function numberValue(root,name,fallback){const raw=root?.querySelector(`[name="${name}"]`)?.value;return raw===undefined||String(raw).trim()===""?fallback:raw;}
function bool(root,name){return Boolean(root?.querySelector(`[name="${name}"]`)?.checked);}
function selectedValues(root,name){return [...(root?.querySelectorAll(`[name="${name}"]:checked`)??[])].map(input=>input.value);}
function optionRows(rows,selected){return rows.map(([value,label])=>({value,label:game.i18n.localize(label),selected:value===selected}));}
function findTokenDocument(id){return canvas?.scene?.tokens?.get?.(id)??canvas?.scene?.tokens?.contents?.find(token=>token.id===id)??null;}
function arrayMove(array,from,to){const next=[...array];const [item]=next.splice(from,1);next.splice(Math.max(0,Math.min(next.length,to)),0,item);return next;}
function activePlayerUsers(){return [...(game.users??[])].filter(user=>!user.isGM&&user.active);}
function safeJson(value){try{return JSON.stringify(value);}catch(_error){return"";}}

async function promptText({title,label,value="",multiline=true}){
  const DialogV2=foundry?.applications?.api?.DialogV2;
  if(DialogV2?.prompt){
    return DialogV2.prompt({window:{title},content:`<div class="standard-form"><label>${label}</label>${multiline?`<textarea name="value" rows="8">${String(value).replaceAll("&","&amp;").replaceAll("<","&lt;")}</textarea>`:`<input name="value" value="${String(value).replaceAll('"','&quot;')}">`}</div>`,ok:{label:game.i18n.localize("OV.Common.Confirm"),callback:(event,button,dialog)=>dialog.element.querySelector('[name="value"]')?.value??""},rejectClose:false});
  }
  return window.prompt(`${title}\n${label}`,value)??null;
}

function filePickerClass(){return globalThis.FilePicker?.implementation??globalThis.FilePicker??foundry?.applications?.apps?.FilePicker?.implementation??foundry?.applications?.apps?.FilePicker;}
function openPicker(type,current=""){
  const Picker=filePickerClass();
  if(!Picker)throw new Error("FilePicker is unavailable.");
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;resolve(value??null);};
    try{
      const picker=new Picker({type,current,callback:path=>finish(path)});
      const originalClose=picker.close?.bind(picker);
      if(originalClose)picker.close=async(...args)=>{try{return await originalClose(...args);}finally{finish(null);}};
      picker.addEventListener?.("close",()=>finish(null),{once:true});
      if(typeof picker.render!=="function")throw new Error("FilePicker.render is unavailable.");
      picker.render(true);
    }catch(error){if(!settled){settled=true;reject(error);}}
  });
}
async function pickFile(type,current=""){return openPicker(type,current);}
async function pickFolder(current=""){return openPicker("folder",current);}
async function browseFolder(path,extensions,recursive=false){
  const Picker=filePickerClass(); const browser=Picker?.browse??globalThis.FilePicker?.browse; if(!browser)return[];
  const source=FILEPICKER_SOURCES.includes(String(path).split(":")[0])?String(path).split(":")[0]:"data";
  const target=source==="data"?path:String(path).replace(new RegExp(`^${source}:`),"");
  const queue=[target],files=[];const visited=new Set();
  while(queue.length){const dir=queue.shift();if(visited.has(dir))continue;visited.add(dir);const result=await browser.call(Picker,source,dir,{extensions});files.push(...(result.files??[]));if(recursive)queue.push(...(result.dirs??[]));}
  return unique(files);
}

function serializeEntryRows(panel){return [...panel.querySelectorAll("[data-entry-id]")].map(row=>normalizeEntry({id:row.dataset.entryId,enabled:bool(row,"entryEnabled"),image:value(row,"entryImage"),audio:value(row,"entryAudio"),weight:numberValue(row,"entryWeight",1),duration:numberValue(row,"entryDuration",0),caption:value(row,"entryCaption"),tags:unique(value(row,"entryTags")),safety:unique(value(row,"entrySafety")),cooldown:numberValue(row,"entryCooldown",0)}));}
function serializeSequenceRows(panel){return [...panel.querySelectorAll("[data-step-id]")].map(row=>normalizeSequenceStep({id:row.dataset.stepId,delay:numberValue(row,"stepDelay",0),duration:numberValue(row,"stepDuration",350),image:value(row,"stepImage"),audio:value(row,"stepAudio"),caption:value(row,"stepCaption"),transition:value(row,"stepTransition","fade")}));}
function serializeTriggerRows(panel){return [...panel.querySelectorAll("[data-trigger-id]")].map(row=>normalizeTrigger({id:row.dataset.triggerId,enabled:bool(row,"triggerEnabled"),type:value(row,"triggerType","manual"),chance:numberValue(row,"triggerChance",1),cooldown:numberValue(row,"triggerCooldown",0),config:{sceneId:value(row,"triggerSceneId"),actorId:value(row,"triggerActorId"),tokenId:value(row,"triggerTokenId"),regionId:value(row,"triggerRegionId"),userId:value(row,"triggerUserId"),contains:value(row,"triggerContains"),path:value(row,"triggerPath"),equals:value(row,"triggerEquals"),minimum:value(row,"triggerMinimum"),maximum:value(row,"triggerMaximum")}}));}

function presentSet(set){
  const triggerTypes=[["manual","OV.Trigger.Manual"],["sceneReady","OV.Trigger.SceneReady"],["combatStart","OV.Trigger.CombatStart"],["combatEnd","OV.Trigger.CombatEnd"],["turnStart","OV.Trigger.TurnStart"],["tokenMoved","OV.Trigger.TokenMoved"],["tokenApproach","OV.Trigger.TokenApproach"],["regionEnter","OV.Trigger.RegionEnter"],["regionExit","OV.Trigger.RegionExit"],["darknessChanged","OV.Trigger.Darkness"],["actorUpdated","OV.Trigger.ActorUpdated"],["chatMessage","OV.Trigger.ChatMessage"],["fblPush","OV.Trigger.FblPush"],["fblBane","OV.Trigger.FblBane"],["fblDamage","OV.Trigger.FblDamage"],["fblSpell","OV.Trigger.FblSpell"],["fblCritical","OV.Trigger.FblCritical"],["fblCondition","OV.Trigger.FblCondition"]];
  return {...set,safetyText:set.safety.join(", "),imagesText:set.images.join("\n"),audioText:set.audio.join("\n"),entries:set.entries.map(entry=>({...entry,tagsText:entry.tags.join(", "),safetyText:entry.safety.join(", ")})),sequence:set.sequence.map(step=>({...step,transitionChoices:optionRows([["fade","OV.Transition.Fade"],["cut","OV.Transition.Cut"],["pulse","OV.Transition.Pulse"]],step.transition)})),triggers:set.triggers.map(trigger=>({...trigger,typeChoices:optionRows(triggerTypes,trigger.type),config:trigger.config??{}})),blendChoices:optionRows([["screen","screen"],["lighten","lighten"],["normal","normal"],["overlay","overlay"],["soft-light","soft-light"],["difference","difference"]],set.blendMode),fitChoices:optionRows([["auto","OV.Fit.Auto"],["contain","OV.Fit.Contain"],["cover","OV.Fit.Cover"]],set.fitMode)};
}

function actorRow(actor,sets){const touched=repository.getTouched(actor);return{id:actor.id,name:actor.name,img:actor.img,enabled:touched.enabled,rank:touched.rank,tags:touched.tags.join(", "),setNames:touched.visionSetUuids.map(uuid=>sets.get(uuid)?.name??uuid).join(", "),hasFlag:actor.getFlag?.(MODULE_ID,"touched")!==undefined};}
function tokenRow(document){const data=repository.getOtherworldly(document),result=visibilityService.evaluate(document);return{id:document.id,uuid:document.uuid,name:document.name,img:document.texture?.src??document.actor?.img,enabled:data.enabled,requiredRank:data.requiredRank,requiredTags:data.requiredTags.join(", "),stage:data.revealStage,canSee:result.canSee,reasons:result.reasons.join(", "),selected:Boolean(document.object?.controlled)};}

export function makeManagerClass(){
  const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
  return class OtherworldlyManager extends HandlebarsApplicationMixin(ApplicationV2){
    constructor(options={}){super(options);this.tab="director";this.selectedSetUuid=null;this.draft=null;this.original=null;this.originalRevision=0;this.assetLimit=24;this.scanResults=[];this.scanProgress=null;this.recipients=new Set(activePlayerUsers().map(user=>user.id));this._scrollState=new Map();this._renderRequest=null;this._draftSyncTimer=null;this._dropRoot=null;this._dropHandler=event=>this.handleDrop(event);this._assetScanToken=null;this._statsCache=null;this._setRowsCache=null;this.unsubscribe=[director.onChange(()=>this.requestRender(["director","diagnostics"],{protectFocus:true})),scheduler.onChange(()=>this.requestRender(["director","diagnostics"],{protectFocus:true})),visibilityService.onChange(()=>this.requestRender(["diagnostics"],{protectFocus:true}))];}
    static DEFAULT_OPTIONS={id:`${MODULE_ID}-manager`,classes:[MODULE_ID,"ov-manager"],tag:"div",window:{title:"OV.Manager.Title",icon:"fa-solid fa-eye"},position:{width:1220,height:860}};
    static PARTS={body:{template:`modules/${MODULE_ID}/templates/manager/manager.hbs`,scrollable:[".ov-workspace",".ov-sidebar-list",".ov-set-workbench"]}};
    get title(){return game.i18n.localize("OV.Manager.Title");}
    requestRender(tabs=null,{protectFocus=false,invalidateStats=false}={}){if(invalidateStats)this._statsCache=null;if(!this.rendered||tabs&&!tabs.includes(this.tab))return;if(protectFocus){const active=this.element?.querySelector(":focus");if(active&&["INPUT","TEXTAREA","SELECT"].includes(active.tagName))return;}if(this._renderRequest)return;const run=()=>{this._renderRequest=null;if(this.rendered)this.render();};this._renderRequest=typeof requestAnimationFrame==="function"?requestAnimationFrame(run):setTimeout(run,0);}
    renderLive(){this.requestRender(["director","diagnostics"],{protectFocus:true});}
    scheduleDraftSync(){clearTimeout(this._draftSyncTimer);this._draftSyncTimer=setTimeout(()=>{this._draftSyncTimer=null;this.syncDraft();},180);}
    invalidateStats(){this._statsCache=null;}
    invalidateAssetScan({clearResults=false}={}){this._assetScanToken=null;this.scanProgress=null;if(clearResults)this.scanResults=[];}
    captureScrollState(){
      const root=this.element;if(!root?.querySelectorAll)return;
      const nodes=[...root.querySelectorAll("[data-scroll-key]")];
      for(const node of nodes){const key=node.dataset.scrollKey;if(!key)continue;this._scrollState.set(key,{top:node.scrollTop??0,left:node.scrollLeft??0});}
    }
    restoreScrollState(){
      const root=this.element;if(!root?.querySelectorAll)return;
      for(const node of root.querySelectorAll("[data-scroll-key]")){const state=this._scrollState.get(node.dataset.scrollKey);if(!state)continue;node.scrollTop=state.top;node.scrollLeft=state.left;}
    }
    render(options={},...args){this.captureScrollState();return super.render(options,...args);}
    ensureDraft(){const state=repository.getState(),dirty=this.isDirty();if(this.selectedSetUuid&&!state.sets[this.selectedSetUuid]){if(!(dirty&&this.draft?.uuid===this.selectedSetUuid)){this.selectedSetUuid=null;this.draft=null;this.original=null;this.originalRevision=state.revision;}}if(!this.selectedSetUuid&&!dirty)this.selectedSetUuid=Object.keys(state.sets)[0]??null;const persisted=this.selectedSetUuid?state.sets[this.selectedSetUuid]:null,reload=Boolean(persisted&&(!this.draft||this.draft.uuid!==this.selectedSetUuid||(!dirty&&safeJson(persisted)!==safeJson(this.original))));if(reload){this.original=clone(persisted);this.draft=clone(this.original);this.originalRevision=state.revision;}return state;}
    syncDraft(){clearTimeout(this._draftSyncTimer);this._draftSyncTimer=null;const panel=this.element?.querySelector("[data-set-editor]");if(!panel||!this.draft)return this.draft;const d=this.draft;Object.assign(d,{name:value(panel,"name",d.name),slug:slugify(value(panel,"slug",d.slug),d.slug),enabled:bool(panel,"setEnabled"),safety:unique(value(panel,"safety")),minDelay:numberValue(panel,"minDelay",d.minDelay),maxDelay:numberValue(panel,"maxDelay",d.maxDelay),chance:numberValue(panel,"chance",d.chance),cooldown:numberValue(panel,"cooldown",d.cooldown),noRepeatWindow:numberValue(panel,"noRepeatWindow",d.noRepeatWindow),minOpacity:numberValue(panel,"minOpacity",d.minOpacity),maxOpacity:numberValue(panel,"maxOpacity",d.maxOpacity),minDuration:numberValue(panel,"minDuration",d.minDuration),maxDuration:numberValue(panel,"maxDuration",d.maxDuration),audioChance:numberValue(panel,"audioChance",d.audioChance),minVolume:numberValue(panel,"minVolume",d.minVolume),maxVolume:numberValue(panel,"maxVolume",d.maxVolume),minScale:numberValue(panel,"minScale",d.minScale),maxScale:numberValue(panel,"maxScale",d.maxScale),minRotation:numberValue(panel,"minRotation",d.minRotation),maxRotation:numberValue(panel,"maxRotation",d.maxRotation),maxBlur:numberValue(panel,"maxBlur",d.maxBlur),blendMode:value(panel,"blendMode",d.blendMode),fitMode:value(panel,"fitMode",d.fitMode),edgeFade:bool(panel,"edgeFade"),edgeFadeSize:numberValue(panel,"edgeFadeSize",d.edgeFadeSize),vignette:bool(panel,"vignette"),images:parsePathList(value(panel,"imagesText"),isImagePath),audio:parsePathList(value(panel,"audioText"),isAudioPath),playlistIds:selectedValues(panel,"playlistIds"),entries:serializeEntryRows(panel),sequence:serializeSequenceRows(panel),triggers:serializeTriggerRows(panel)});this.draft=normalizeVisionSet(d);return this.draft;}
    isDirty(){return Boolean(this.draft&&safeJson(this.draft)!==safeJson(this.original));}
    async confirmDiscardDraft(){this.syncDraft();if(!this.isDirty())return true;return confirmDialog(game.i18n.localize("OV.Confirm.DiscardChangesTitle"),game.i18n.format("OV.Confirm.DiscardChangesBody",{name:this.draft?.name??game.i18n.localize("OV.Common.Unsaved")}));}
    setRows(state){if(this._setRowsCache?.revision===state.revision&&this._setRowsCache?.selected===this.selectedSetUuid)return this._setRowsCache.rows;const rows=Object.values(state.sets).sort((a,b)=>a.name.localeCompare(b.name)).map(set=>({uuid:set.uuid,name:set.name,enabled:set.enabled,selected:set.uuid===this.selectedSetUuid,images:set.images.length,audio:set.audio.length,triggers:set.triggers.length}));this._setRowsCache={revision:state.revision,selected:this.selectedSetUuid,rows};return rows;}
    baseStats(state){if(this._statsCache?.revision===state.revision)return this._statsCache;const sets=Object.values(state.sets),actors=[...(game.actors??[])].reduce((count,actor)=>count+(repository.getTouched(actor).enabled?1:0),0),tokens=visibilityService.getOtherworldlyDocuments().length;this._statsCache={revision:state.revision,sets:sets.length,images:sets.reduce((n,set)=>n+set.images.length,0),audio:sets.reduce((n,set)=>n+set.audio.length,0),actors,tokens};return this._statsCache;}
    userRows(){return[...(game.users??[])].filter(user=>!user.isGM).map(user=>{const status=user.getFlag?.(MODULE_ID,"clientStatus")??{};return{id:user.id,name:user.name,active:user.active,checked:this.recipients.has(user.id),state:status.state??"unknown",version:status.moduleVersion??"-",lastSeen:status.lastSeen?new Date(status.lastSeen).toLocaleTimeString():"-"};});}
    async _prepareContext(){
      const state=this.ensureDraft(),isDirector=this.tab==="director",isSets=this.tab==="sets",isActors=this.tab==="actors",isTokens=this.tab==="tokens",isDiagnostics=this.tab==="diagnostics",sets=this.setRows(state);
      const context={moduleId:MODULE_ID,moduleVersion:MODULE_VERSION,tab:this.tab,isDirector,isSets,isActors,isTokens,isDiagnostics,tabs:["director","sets","actors","tokens","diagnostics"].map(id=>({id,label:game.i18n.localize(`OV.Tab.${id[0].toUpperCase()+id.slice(1)}`),active:this.tab===id})),sets,selectedSet:null,dirty:this.isDirty(),revision:state.revision,setPresets:[],tokenPresets:[],playlists:[],selectedPlaylistCount:0,selectedPlaylistSoundCount:0,users:[],actors:[],selectedTokens:[],otherworldlyTokens:[],hasScene:Boolean(canvas?.scene),globalFlash:game.settings.get(MODULE_ID,SETTINGS.FLASH_ENABLED),sceneLayer:tokenEffects.sceneLayerEnabled,previewUserId:visibilityService.previewUserId,director:{current:null,queue:[],history:[]},scheduler:{running:false,generation:0,jobs:[]},triggerService:null,diagnostics:null,scanResults:this.scanResults,scanProgress:this.scanProgress,assetLimit:this.assetLimit,stats:{sets:0,images:0,audio:0,actors:0,tokens:0,queued:0,jobs:0}};
      if(isDirector){const snapshot=director.snapshot(),schedule=scheduler.snapshot(),base=this.baseStats(state);context.users=this.userRows();context.selectedSet=this.draft?{name:this.draft.name}:null;context.director=snapshot;context.scheduler=schedule;context.stats={...base,queued:snapshot.queue.length,jobs:schedule.jobs.length};}
      if(isSets){if(this.draft){context.selectedSet=presentSet(this.draft);context.selectedSet.visibleImages=this.draft.images.slice(0,this.assetLimit).map((path,index)=>({path,index,name:assetName(path)}));context.selectedSet.audioItems=this.draft.audio.map((path,index)=>({path,index,name:assetName(path)}));context.selectedSet.hasMoreImages=this.draft.images.length>this.assetLimit;}context.setPresets=Object.entries(SET_PRESETS).map(([id,preset])=>({id,label:game.i18n.localize(preset.name)}));context.playlists=[...(game.playlists??[])].map(p=>({id:p.id,name:p.name,selected:this.draft?.playlistIds?.includes(p.id),sounds:p.sounds?.size??p.sounds?.contents?.length??0}));context.selectedPlaylistCount=context.playlists.filter(p=>p.selected).length;context.selectedPlaylistSoundCount=context.playlists.filter(p=>p.selected).reduce((sum,p)=>sum+p.sounds,0);}
      if(isActors){const setMap=new Map(Object.values(state.sets).map(set=>[set.uuid,set]));context.actors=[...(game.actors??[])].map(actor=>actorRow(actor,setMap)).filter(row=>row.enabled||row.hasFlag).sort((a,b)=>Number(b.enabled)-Number(a.enabled)||a.name.localeCompare(b.name));}
      if(isTokens){context.users=this.userRows();context.tokenPresets=Object.entries(TOKEN_PRESETS).map(([id,preset])=>({id,label:game.i18n.localize(preset.name)}));context.selectedTokens=(canvas?.tokens?.controlled??[]).map(token=>tokenRow(token.document));context.otherworldlyTokens=visibilityService.getOtherworldlyDocuments().map(tokenRow);}
      if(isDiagnostics){const orphans=repository.getOrphanReferences(),sessionLog=game.settings.get(MODULE_ID,SETTINGS.SESSION_LOG)??[];context.diagnostics={visibility:visibilityService.healthSnapshot(),effects:tokenEffects.snapshot(),commands:commandBus.snapshot(),media:mediaCache.snapshot(),orphans,sessionLog:sessionLog.slice(0,50),migrationComplete:game.settings.get(MODULE_ID,SETTINGS.MIGRATION_COMPLETE),backupAt:game.settings.get(MODULE_ID,SETTINGS.MIGRATION_BACKUP)?.createdAt??null};context.triggerService=triggerService.snapshot();}
      return context;
    }
    async _onClickAction(event,target){
      const action=target?.dataset?.action;
      const handler=action?this.constructor[action]:null;
      if(typeof handler!=="function")return;
      event.preventDefault();
      if(target.dataset.busy==="true")return;
      target.dataset.busy="true";
      target.setAttribute("aria-busy","true");
      try{return await handler.call(this,event,target);}
      catch(error){const label=target.getAttribute?.("aria-label")||target.title||target.textContent?.trim()||action;warn(`Manager action ${action} failed`,error);notify("error","OV.Notifications.ActionFailed",{action:label,error:error?.message??String(error)});}
      finally{if(target.isConnected){delete target.dataset.busy;target.removeAttribute("aria-busy");}}
    }
    async _onRender(context,options){
      await super._onRender(context,options);
      applyWindowChrome(this);
      const root=this.element;
      root?.querySelectorAll("textarea[data-autosize]").forEach(area=>{
        const resize=()=>{area.style.height="auto";area.style.height=`${Math.min(140,area.scrollHeight)}px`;};
        resize();area.addEventListener("input",resize);
      });
      for(const image of root?.querySelectorAll?.("img[data-asset-preview]")??[]){
        const candidates=assetCandidates(image.dataset.assetPreview??image.getAttribute("src")??"");
        let candidateIndex=0;
        const card=image.closest("[data-asset-item]");
        image.addEventListener("load",()=>card?.classList.remove("is-broken"));
        image.addEventListener("error",()=>{
          candidateIndex+=1;
          if(candidateIndex<candidates.length)image.src=candidates[candidateIndex];
          else card?.classList.add("is-broken");
        });
      }
      for(const filter of root?.querySelectorAll?.("[data-asset-filter]")??[]){
        const apply=()=>{
          const query=filter.value.trim().toLowerCase();
          const kind=filter.dataset.assetFilter;
          for(const item of root.querySelectorAll(`[data-asset-container="${kind}"] [data-asset-item]`))item.hidden=Boolean(query&&!String(item.dataset.assetPath??"").toLowerCase().includes(query));
        };
        filter.addEventListener("input",apply);apply();
      }
      const editor=root?.querySelector("[data-set-editor]");
      editor?.addEventListener("input",()=>this.scheduleDraftSync());
      editor?.addEventListener("change",()=>this.syncDraft());
      for(const input of root?.querySelectorAll?.('[name="recipientIds"]')??[])input.addEventListener("change",()=>this.readRecipients());
      if(this._dropRoot!==root){this._dropRoot?.removeEventListener?.("drop",this._dropHandler);root?.addEventListener?.("drop",this._dropHandler);this._dropRoot=root;}
      const restore=()=>this.restoreScrollState();
      if(typeof requestAnimationFrame==="function")requestAnimationFrame(restore);else setTimeout(restore,0);
    }
    async handleDrop(event){const panel=event.target.closest("[data-set-editor]");if(!panel||!this.draft)return;let data;try{data=TextEditor.getDragEventData(event);}catch(_error){return;}const path=data?.path??data?.src??data?.texture?.src;if(!path)return;this.syncDraft();if(isImagePath(path))this.draft.images=unique([...this.draft.images,path]);else if(isAudioPath(path))this.draft.audio=unique([...this.draft.audio,path]);else return;this.render();}
    static selectTab(event,target){this.syncDraft();this.readRecipients();this.tab=target.dataset.tab;this.render();}
    static async selectSet(event,target){if(target.dataset.setUuid===this.selectedSetUuid){if(target.dataset.openEditor==="true")this.tab="sets";return this.render();}if(!await this.confirmDiscardDraft())return;this.invalidateAssetScan({clearResults:true});this.selectedSetUuid=target.dataset.setUuid;this.draft=null;this.original=null;if(target.dataset.openEditor==="true")this.tab="sets";this.render();}
    static async addSet(){if(!await this.confirmDiscardDraft())return;this.invalidateAssetScan({clearResults:true});const set=normalizeVisionSet({name:game.i18n.localize("OV.Set.New")});await repository.upsertSet(set);this.selectedSetUuid=set.uuid;this.draft=clone(set);this.original=clone(set);this.originalRevision=repository.getState().revision;this.tab="sets";this.render();}
    static async duplicateSet(){if(!this.syncDraft())return;this.invalidateAssetScan({clearResults:true});const copy=normalizeVisionSet({...clone(this.draft),uuid:"",legacyIds:[],name:`${this.draft.name} ${game.i18n.localize("OV.Common.Copy")}`,slug:`${this.draft.slug}-copy-${randomId(4)}`});await repository.upsertSet(copy);this.selectedSetUuid=copy.uuid;this.draft=clone(copy);this.original=clone(copy);this.originalRevision=repository.getState().revision;this.render();}
    static applySetPreset(event,target){if(!this.syncDraft())return;const preset=SET_PRESETS[target.dataset.preset];if(!preset)return;this.draft=normalizeVisionSet({...this.draft,...preset.patch});this.render();}
    static async saveSet(){const draft=this.syncDraft();if(!draft)return;const current=repository.getState();let expected=this.originalRevision;if(current.revision!==this.originalRevision){const persisted=current.sets[draft.uuid];if(safeJson(persisted)===safeJson(this.original))expected=current.revision;else return notify("error","OV.Notifications.RevisionConflict");}try{const result=await repository.upsertSet(draft,{expectedRevision:expected});this.original=clone(result.result);this.draft=clone(result.result);this.originalRevision=result.state.revision;notify("info","OV.Notifications.SetSaved",{name:draft.name});this.requestRender();}catch(error){if(error instanceof RevisionConflictError)notify("error","OV.Notifications.RevisionConflict");else throw error;}}
    static revertSet(){const current=repository.getSet(this.selectedSetUuid);this.original=clone(current);this.draft=clone(current);this.originalRevision=repository.getState().revision;this.render();}
    static async deleteSet(){if(!this.draft)return;const yes=await confirmDialog(game.i18n.localize("OV.Confirm.DeleteSetTitle"),game.i18n.format("OV.Confirm.DeleteSetBody",{name:this.draft.name}));if(!yes)return;this.invalidateAssetScan({clearResults:true});await repository.deleteSet(this.draft.uuid,{cleanReferences:true});this.draft=null;this.original=null;this.selectedSetUuid=null;this.requestRender();}
    static async toggleGlobalFlash(){await game.settings.set(MODULE_ID,SETTINGS.FLASH_ENABLED,!game.settings.get(MODULE_ID,SETTINGS.FLASH_ENABLED));this.render();}
    static async addImage(){this.syncDraft();const path=await pickFile("image");if(path&&isImagePath(path))this.draft.images=unique([...this.draft.images,path]);this.render();}
    static async addImageFolder(event,target){return this.addFolder(false,"image");}
    static async addImageFolderRecursive(event,target){return this.addFolder(true,"image");}
    async addFolder(recursive,type){this.syncDraft();const path=await pickFolder();if(!path)return;const extensions=type==="image"?IMAGE_EXTENSIONS:AUDIO_EXTENSIONS;const files=await browseFolder(path,extensions,recursive);if(type==="image")this.draft.images=unique([...this.draft.images,...files.filter(isImagePath)]);else this.draft.audio=unique([...this.draft.audio,...files.filter(isAudioPath)]);notify("info","OV.Notifications.FilesAdded",{count:files.length});this.render();}
    static async importImagesText(){this.syncDraft();const text=await promptText({title:game.i18n.localize("OV.Assets.ImportImages"),label:game.i18n.localize("OV.Assets.Paths"),value:""});if(text!==null)this.draft.images=unique([...this.draft.images,...parsePathList(text,isImagePath)]);this.render();}
    static loadMoreAssets(){this.assetLimit+=24;this.render();}
    static removeImage(event,target){this.syncDraft();this.draft.images.splice(Number(target.dataset.index),1);this.render();}
    static async addAudio(){this.syncDraft();const path=await pickFile("audio");if(path&&isAudioPath(path))this.draft.audio=unique([...this.draft.audio,path]);this.render();}
    static async importAudioText(){this.syncDraft();const text=await promptText({title:game.i18n.localize("OV.Assets.ImportAudio"),label:game.i18n.localize("OV.Assets.Paths"),value:""});if(text!==null)this.draft.audio=unique([...this.draft.audio,...parsePathList(text,isAudioPath)]);this.render();}
    static removeAudio(event,target){this.syncDraft();this.draft.audio.splice(Number(target.dataset.index),1);this.render();}
    static async previewAudio(event,target){await director.enqueuePayload({audio:target.dataset.path,image:"",caption:"",duration:1800,volume:.65,safety:[]},{source:"manager-preview-audio",priority:PRIORITY.MANUAL,conflict:CONFLICT.REPLACE});}
    static async previewAsset(event,target){this.syncDraft();const image=target.dataset.path??"";await director.enqueuePayload(director.buildAssetPayload(this.draft,{image}),{setUuid:this.draft.uuid,setName:this.draft.name,source:"manager-preview",priority:PRIORITY.MANUAL,conflict:CONFLICT.REPLACE});}
    static async cueAssetRemote(event,target){this.syncDraft();const recipients=this.readRecipients();if(!recipients.length)return notify("warn","OV.Notifications.NoRecipients");await commandBus.dispatchAsset(this.draft.uuid,{image:target.dataset.path},recipients,{conflict:CONFLICT.REPLACE_LOWER});notify("info","OV.Notifications.CueSent",{count:recipients.length});}
    readRecipients(){const ids=selectedValues(this.element,"recipientIds");this.recipients=new Set(ids);return ids;}
    static addEntry(){this.syncDraft();this.draft.entries.push(normalizeEntry({...DEFAULT_ENTRY,id:randomId(10)}));this.render();}
    static removeEntry(event,target){this.syncDraft();this.draft.entries=this.draft.entries.filter(row=>row.id!==target.dataset.entryId);this.render();}
    static addSequenceStep(){this.syncDraft();this.draft.sequence.push(normalizeSequenceStep({...DEFAULT_SEQUENCE_STEP,id:randomId(10)}));this.render();}
    static removeSequenceStep(event,target){this.syncDraft();this.draft.sequence=this.draft.sequence.filter(row=>row.id!==target.dataset.stepId);this.render();}
    static moveSequenceStep(event,target){this.syncDraft();const index=this.draft.sequence.findIndex(row=>row.id===target.dataset.stepId),delta=Number(target.dataset.delta);if(index>=0)this.draft.sequence=arrayMove(this.draft.sequence,index,index+delta);this.render();}
    static addTrigger(){this.syncDraft();this.draft.triggers.push(normalizeTrigger({...DEFAULT_TRIGGER,id:randomId(10)}));this.render();}
    static removeTrigger(event,target){this.syncDraft();this.draft.triggers=this.draft.triggers.filter(row=>row.id!==target.dataset.triggerId);this.render();}
    static async testDraft(){this.syncDraft();const countdown=Number(value(this.element,"remoteCountdown",0))||0;await director.enqueueSet(this.draft,{source:"manager-test",forced:true,priority:PRIORITY.MANUAL,conflict:value(this.element,"remoteConflict",CONFLICT.REPLACE),countdown});}
    static async cueRemote(){this.syncDraft();const recipients=this.readRecipients();if(!recipients.length)return notify("warn","OV.Notifications.NoRecipients");await commandBus.dispatchSet(this.draft.uuid,recipients,{conflict:value(this.element,"remoteConflict",CONFLICT.REPLACE_LOWER),countdown:Number(value(this.element,"remoteCountdown",0))||0,forced:true});notify("info","OV.Notifications.CueSent",{count:recipients.length});}
    static stopAll(){director.stopAll("gm-stop");const recipients=this.readRecipients();if(recipients.length)void commandBus.dispatchStopAll(recipients);}
    static repeatLast(){return director.repeatLast();}
    static async toggleActor(event,target){const actor=game.actors.get(target.dataset.actorId);if(!actor)return;const data=repository.getTouched(actor);await repository.setTouched(actor,{enabled:!data.enabled});}
    static editActor(event,target){const actor=game.actors.get(target.dataset.actorId);if(actor)openActorEditor(actor);}
    static async toggleToken(event,target){const doc=findTokenDocument(target.dataset.tokenId);if(!doc)return;const data=repository.getOtherworldly(doc);await repository.setOtherworldly(doc,{enabled:!data.enabled});}
    static editToken(event,target){const doc=findTokenDocument(target.dataset.tokenId);if(doc)openTokenEditor(doc);}
    static async markSelectedTokens(){const docs=canvas?.tokens?.controlled?.map(token=>token.document)??[];if(!docs.length)return notify("warn","OV.Notifications.NoTokensSelected");const updates=docs.map(doc=>({_id:doc.id,[`flags.${MODULE_ID}.otherworldly`]:normalizeOtherworldly({...repository.getOtherworldly(doc),enabled:true})}));await canvas.scene.updateEmbeddedDocuments("Token",updates);}
    static async applySelectedTokenSettings(){const form=this.element.querySelector("[data-bulk-token]");const docs=canvas?.tokens?.controlled?.map(token=>token.document)??[];if(!form||!docs.length)return notify("warn","OV.Notifications.NoTokensSelected");const patch={enabled:true,requiredRank:numberValue(form,"bulkRequiredRank",1),requiredTags:unique(value(form,"bulkRequiredTags")),revealStage:numberValue(form,"bulkRevealStage",4),viewerOpacity:numberValue(form,"bulkOpacity",1),maxDistance:numberValue(form,"bulkDistance",0),requireLineOfSight:bool(form,"bulkLineOfSight"),suppressLight:bool(form,"bulkSuppressLight"),suppressVision:bool(form,"bulkSuppressVision")};const updates=docs.map(doc=>({_id:doc.id,[`flags.${MODULE_ID}.otherworldly`]:normalizeOtherworldly({...repository.getOtherworldly(doc),...patch})}));await canvas.scene.updateEmbeddedDocuments("Token",updates);}
    static async applyTokenPreset(event,target){const preset=TOKEN_PRESETS[target.dataset.preset],docs=canvas?.tokens?.controlled?.map(token=>token.document)??[];if(!preset||!docs.length)return notify("warn","OV.Notifications.NoTokensSelected");const updates=docs.map(doc=>({_id:doc.id,[`flags.${MODULE_ID}.otherworldly`]:normalizeOtherworldly({...repository.getOtherworldly(doc),...preset.patch})}));await canvas.scene.updateEmbeddedDocuments("Token",updates);}
    static async clearSelectedTokens(){const docs=canvas?.tokens?.controlled?.map(token=>token.document)??[];if(!docs.length)return notify("warn","OV.Notifications.NoTokensSelected");await canvas.scene.updateEmbeddedDocuments("Token",docs.map(doc=>({_id:doc.id,[`flags.${MODULE_ID}.-=otherworldly`]:null})));}
    static async rewriteAssetPaths(){this.syncDraft();const from=await promptText({title:game.i18n.localize("OV.Assets.Rewrite"),label:game.i18n.localize("OV.Assets.OldPrefix"),multiline:false});if(!from)return;const to=await promptText({title:game.i18n.localize("OV.Assets.Rewrite"),label:game.i18n.localize("OV.Assets.NewPrefix"),multiline:false});if(to===null)return;const replace=path=>path?.startsWith(from)?`${to}${path.slice(from.length)}`:path;this.draft.images=this.draft.images.map(replace);this.draft.audio=this.draft.audio.map(replace);this.draft.entries=this.draft.entries.map(row=>({...row,image:replace(row.image),audio:replace(row.audio)}));this.draft.sequence=this.draft.sequence.map(row=>({...row,image:replace(row.image),audio:replace(row.audio)}));this.render();}
    static refreshVisibility(){visibilityService.profileCache.invalidate();visibilityService.refreshAll();notify("info","OV.Notifications.VisibilityRefreshed");}
    static toggleSceneLayer(){tokenEffects.setSceneLayerEnabled(!tokenEffects.sceneLayerEnabled);this.render();}
    static previewUser(event,target){visibilityService.setPreviewUser(target.dataset.userId||null);this.render();}
    static manifestSelected(){const recipients=this.readRecipients();for(const token of canvas?.tokens?.controlled??[]){if(recipients.length)void commandBus.dispatchManifest(token.document.uuid,2500,recipients);else visibilityService.forceManifest(token.document,2500);}}
    static async scanAssets(){if(!this.draft)return;this.syncDraft();const draft=this.draft,setUuid=this.selectedSetUuid??draft.uuid,token={};this._assetScanToken=token;this.scanResults=[];this.scanProgress={completed:0,total:0};this.render();try{const results=await mediaCache.scanSet(draft,progress=>{if(this._assetScanToken!==token||this.selectedSetUuid!==setUuid||this.draft!==draft)return;this.scanProgress=progress;const bar=this.element?.querySelector?.("[data-scan-progress]");if(bar){bar.max=Math.max(1,Number(progress.total)||1);bar.value=Number(progress.completed)||0;bar.setAttribute("aria-valuetext",`${progress.completed ?? 0} / ${progress.total ?? 0}`);}});if(this._assetScanToken===token&&this.selectedSetUuid===setUuid&&this.draft===draft)this.scanResults=results;}finally{if(this._assetScanToken===token){this._assetScanToken=null;this.scanProgress=null;if(this.rendered)this.render();}}}
    static clearMediaCache(){this.invalidateAssetScan({clearResults:true});mediaCache.clear();notify("info","OV.Notifications.CacheCleared");this.render();}
    static async repairOrphans(){const count=await repository.repairOrphans();notify("info","OV.Notifications.OrphansRepaired",{count});this.render();}
    static exportDiagnostics(){downloadJson({module:MODULE_ID,version:MODULE_VERSION,at:new Date().toISOString(),state:repository.getState(),director:director.snapshot(),scheduler:scheduler.snapshot(),visibility:visibilityService.healthSnapshot(),effects:tokenEffects.snapshot(),commands:commandBus.snapshot(),triggers:triggerService.snapshot(),media:mediaCache.snapshot(),orphans:repository.getOrphanReferences(),sessionLog:game.settings.get(MODULE_ID,SETTINGS.SESSION_LOG)},`${MODULE_ID}-diagnostics-${Date.now()}.json`);}
    static exportSets(){repository.exportData();}
    static async importSets(){if(!await this.confirmDiscardDraft())return;const input=document.createElement("input");input.type="file";input.accept="application/json,.json";input.addEventListener("change",async()=>{const file=input.files?.[0];if(!file)return;try{const payload=JSON.parse(await file.text());this.invalidateAssetScan({clearResults:true});await repository.importData(payload,{replace:false});this.draft=null;this.original=null;this.render();notify("info","OV.Notifications.ImportComplete");}catch(error){warn(error);notify("error","OV.Notifications.ImportFailed",{error:error.message});}});input.click();}
    static exportMigrationBackup(){if(!repository.exportMigrationBackup())notify("warn","OV.Notifications.NoBackup");}
    static async restoreMigrationBackup(){if(!await this.confirmDiscardDraft())return;const yes=await confirmDialog(game.i18n.localize("OV.Confirm.RestoreTitle"),game.i18n.localize("OV.Confirm.RestoreBody"));if(!yes)return;this.invalidateAssetScan({clearResults:true});await repository.restoreMigrationBackup();this.draft=null;this.original=null;location.reload();}
    static async clearSessionLog(){const yes=await confirmDialog(game.i18n.localize("OV.Diagnostics.SessionLog"),game.i18n.localize("OV.Confirm.ClearSessionLogBody"));if(!yes)return;await game.settings.set(MODULE_ID,SETTINGS.SESSION_LOG,[]);this.render();}
    static async createMacro(){let macroUuid=game.settings.get(MODULE_ID,SETTINGS.MACRO_UUID);let macro=macroUuid?await fromUuid(macroUuid).catch(()=>null):null;if(!macro)macro=await Macro.create({name:game.i18n.localize("OV.Manager.Title"),type:"script",img:"icons/svg/eye.svg",command:`game.modules.get("${MODULE_ID}").api.openManager();`});await game.settings.set(MODULE_ID,SETTINGS.MACRO_UUID,macro.uuid);notify("info","OV.Notifications.MacroCreated");}
    static async syncSchedulers(){const users=activePlayerUsers();if(users.length)await commandBus.dispatchSyncScheduler(users.map(user=>user.id));notify("info","OV.Notifications.SchedulersSynced",{count:users.length});}
    static resetSession(){director.resetSession();visibilityService.resetSessionMemory();triggerService.reset();scheduler.requestReconcile(0);this.render();}
    static async fireTrigger(event,target){await triggerService.fire(target.dataset.triggerType,{event:"manual-director"},{allowGM:true});}
    async close(options={}){if(!await this.confirmDiscardDraft())return this;this.invalidateAssetScan();clearTimeout(this._draftSyncTimer);if(this._renderRequest){if(typeof cancelAnimationFrame==="function")cancelAnimationFrame(this._renderRequest);else clearTimeout(this._renderRequest);this._renderRequest=null;}this._dropRoot?.removeEventListener?.("drop",this._dropHandler);this._dropRoot=null;for(const off of this.unsubscribe)off?.();if(managerInstance===this)managerInstance=null;return super.close(options);}
  };
}

export function openManager(){if(!game.user?.isGM)return ui.notifications?.warn?.(game.i18n.localize("OV.Notifications.GMOnly"));if(!managerInstance){const Cls=makeManagerClass();managerInstance=new Cls();}return managerInstance.render(true);}
export function refreshManager(tabs=null,options={}){if(managerInstance?.rendered)managerInstance.requestRender(tabs,options);}
