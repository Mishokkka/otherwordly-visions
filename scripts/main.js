import { FLAGS, MODULE_ID, MODULE_VERSION, SCHEMA_VERSION, SETTINGS } from "./constants.js";
import { commandBus } from "./commands/command-bus.js";
import { repository } from "./data/repository.js";
import { createApi } from "./api.js";
import { openActorEditor, openSafety, openTokenEditor, makeSafetyAppClass, refreshEditors } from "./apps/editors.js";
import { makeManagerClass, openManager, refreshManager } from "./apps/manager.js";
import { triggerService } from "./triggers/trigger-service.js";
import { log, warn } from "./utils.js";
import { director } from "./visions/director.js";
import { overlay } from "./visions/overlay.js";
import { scheduler } from "./visions/scheduler.js";
import { tokenEffects } from "./visibility/token-effects.js";
import { visibilityService } from "./visibility/visibility-service.js";

function registerSettings(){
  const register=(key,data)=>game.settings.register(MODULE_ID,key,data);
  register(SETTINGS.STATE,{scope:"world",config:false,type:Object,default:{schemaVersion:SCHEMA_VERSION,revision:0,sets:{}},onChange:()=>{scheduler.requestReconcile(50);refreshManager();}});
  register(SETTINGS.LEGACY_VISION_SETS,{scope:"world",config:false,type:Object,default:{}});
  register(SETTINGS.FLASH_ENABLED,{name:"OV.Settings.FlashEnabled.Name",hint:"OV.Settings.FlashEnabled.Hint",scope:"world",config:true,restricted:true,type:Boolean,default:true,onChange:()=>scheduler.requestReconcile(0)});
  register(SETTINGS.DEBUG,{name:"OV.Settings.Debug.Name",hint:"OV.Settings.Debug.Hint",scope:"world",config:true,restricted:true,type:Boolean,default:false});
  register(SETTINGS.COMMAND,{scope:"world",config:false,type:Object,default:{},onChange:value=>void commandBus.receive(value)});
  register(SETTINGS.SESSION_LOG,{scope:"world",config:false,type:Array,default:[]});
  register(SETTINGS.MIGRATION_BACKUP,{scope:"world",config:false,type:Object,default:{}});
  register(SETTINGS.MIGRATION_COMPLETE,{scope:"world",config:false,type:Boolean,default:false});
  register(SETTINGS.MACRO_UUID,{scope:"world",config:false,type:String,default:""});
  register(SETTINGS.DIRECT_FALLBACK,{name:"OV.Settings.DirectFallback.Name",hint:"OV.Settings.DirectFallback.Hint",scope:"world",config:true,restricted:true,type:Boolean,default:true,requiresReload:true});
  register(SETTINGS.PLAYER_FLASH,{name:"OV.Settings.PlayerFlash.Name",hint:"OV.Settings.PlayerFlash.Hint",scope:"client",config:false,type:Boolean,default:true,onChange:()=>scheduler.requestReconcile(0)});
  register(SETTINGS.VOLUME_CAP,{name:"OV.Settings.VolumeCap.Name",hint:"OV.Settings.VolumeCap.Hint",scope:"client",config:false,type:Number,range:{min:0,max:1,step:.05},default:1});
  register(SETTINGS.OPACITY_CAP,{name:"OV.Settings.OpacityCap.Name",hint:"OV.Settings.OpacityCap.Hint",scope:"client",config:false,type:Number,range:{min:.05,max:1,step:.05},default:1,onChange:()=>tokenEffects.refreshAll()});
  register(SETTINGS.REDUCED_MOTION,{name:"OV.Settings.ReducedMotion.Name",hint:"OV.Settings.ReducedMotion.Hint",scope:"client",config:false,type:Boolean,default:false});
  register(SETTINGS.PHOTOSENSITIVE,{name:"OV.Settings.Photosensitive.Name",hint:"OV.Settings.Photosensitive.Hint",scope:"client",config:false,type:Boolean,default:false});
  register(SETTINGS.BLOCKED_SAFETY_TAGS,{name:"OV.Settings.BlockedTags.Name",hint:"OV.Settings.BlockedTags.Hint",scope:"client",config:false,type:Array,default:[]});
  register(SETTINGS.ALLOW_HIDDEN,{name:"OV.Settings.AllowHidden.Name",hint:"OV.Settings.AllowHidden.Hint",scope:"client",config:false,type:Boolean,default:false,onChange:()=>scheduler.requestReconcile(0)});
  register(SETTINGS.MIN_INTERVAL,{name:"OV.Settings.MinimumInterval.Name",hint:"OV.Settings.MinimumInterval.Hint",scope:"client",config:false,type:Number,default:0});
  register(SETTINGS.EMERGENCY_MUTE,{name:"OV.Settings.EmergencyMute.Name",hint:"OV.Settings.EmergencyMute.Hint",scope:"client",config:false,type:Boolean,default:false,onChange:value=>{if(value)director.stopAll("emergency-mute");}});
  const Manager=makeManagerClass(),Safety=makeSafetyAppClass();
  game.settings.registerMenu(MODULE_ID,"manager",{name:"OV.Menu.Manager.Name",label:"OV.Menu.Manager.Label",hint:"OV.Menu.Manager.Hint",icon:"fas fa-eye",type:Manager,restricted:true});
  game.settings.registerMenu(MODULE_ID,"safety",{name:"OV.Menu.Safety.Name",label:"OV.Menu.Safety.Label",hint:"OV.Menu.Safety.Hint",icon:"fas fa-shield-heart",type:Safety,restricted:false});
}

function registerKeybindings(){
  game.keybindings.register(MODULE_ID,"emergencyMute",{name:"OV.Keybindings.EmergencyMute.Name",hint:"OV.Keybindings.EmergencyMute.Hint",editable:[{key:"KeyM",modifiers:["SHIFT"]}],onDown:()=>{const next=!game.settings.get(MODULE_ID,SETTINGS.EMERGENCY_MUTE);void game.settings.set(MODULE_ID,SETTINGS.EMERGENCY_MUTE,next);if(next)director.stopAll("emergency-mute");ui.notifications?.info?.(game.i18n.localize(next?"OV.Notifications.EmergencyOn":"OV.Notifications.EmergencyOff"));return true;},restricted:false,precedence:CONST.KEYBINDING_PRECEDENCE?.NORMAL??0});
}

function isMigrationLeader(){const active=[...(game.users??[])].filter(user=>user.active&&user.isGM).sort((a,b)=>a.id.localeCompare(b.id));return game.user?.isGM&&active[0]?.id===game.user.id;}
async function migrateIfNeeded(){if(!isMigrationLeader())return;try{const result=await repository.migrateLegacyData();if(result.migrated)ui.notifications?.info?.(game.i18n.format("OV.Notifications.Migrated",result));}catch(error){warn("Migration failed",error);ui.notifications?.error?.(game.i18n.format("OV.Notifications.MigrationFailed",{error:error.message}));}}

function findSceneControl(controls,names){
  const wanted=new Set(names);
  if(Array.isArray(controls))return controls.find(control=>wanted.has(control?.name))??null;
  for(const name of names){if(controls?.[name])return controls[name];}
  return Object.values(controls??{}).find(control=>wanted.has(control?.name))??null;
}
function removeSceneControlTool(group,name){
  if(!group?.tools)return;
  if(Array.isArray(group.tools)){
    for(let index=group.tools.length-1;index>=0;index--){if(group.tools[index]?.name===name)group.tools.splice(index,1);}
    return;
  }
  delete group.tools[name];
}
function insertSceneControlTool(group,tool){
  if(!group?.tools)return false;
  if(Array.isArray(group.tools)){
    removeSceneControlTool(group,tool.name);
    group.tools.push(tool);
    return true;
  }
  group.tools[tool.name]=tool;
  return true;
}
export function addSceneControlButton(controls){
  if(!game.user?.isGM)return;
  const toolName=`${MODULE_ID}-manager`;

  // Keep the module out of Token Controls, including after hot reloads where an
  // older registration may still be present in the prepared control data.
  removeSceneControlTool(findSceneControl(controls,["tokens","token"]),toolName);

  // Foundry v13 exposes Journal Notes as the `notes` SceneControl. The
  // additional aliases preserve compatibility with array-shaped v12 data and
  // possible system-level naming overrides without returning the tool to Tokens.
  const group=findSceneControl(controls,["notes","journal","journals"]);
  if(!group)return;
  const order=Array.isArray(group.tools)?group.tools.length:Object.keys(group.tools??{}).length;
  const tool={
    name:toolName,
    title:"OV.Manager.Title",
    icon:"fa-solid fa-eye",
    order,
    button:true,
    visible:true,
    onClick:()=>openManager(),
    onChange:()=>openManager()
  };
  insertSceneControlTool(group,tool);
}
function addTokenHudButton(app,html,data){
  if(!game.user?.isGM)return;const root=html instanceof HTMLElement?html:html?.[0];if(!root)return;const token=app.object??canvas?.tokens?.get?.(data?._id),document=token?.document??canvas?.scene?.tokens?.get?.(data?._id);if(!document)return;const flag=repository.getOtherworldly(document),column=root.querySelector(".col.right")??root.querySelector(".right")??root;const button=globalThis.document.createElement("div");button.className=`control-icon ov-token-hud ${flag.enabled?"active":""}`;button.title=game.i18n.localize(flag.enabled?"OV.TokenHud.Enabled":"OV.TokenHud.Disabled");button.innerHTML=`<i class="fa-solid ${flag.enabled?"fa-eye":"fa-eye-slash"}"></i>`;button.addEventListener("click",async event=>{event.preventDefault();event.stopPropagation();await repository.setOtherworldly(document,{enabled:!repository.getOtherworldly(document).enabled});visibilityService.refreshToken(document.object);app.render(true);refreshManager();});button.addEventListener("contextmenu",event=>{event.preventDefault();openTokenEditor(document);});column.appendChild(button);
}
function isApplicationV2(app){
  const ApplicationV2=globalThis.foundry?.applications?.api?.ApplicationV2;
  return Boolean(ApplicationV2&&app instanceof ApplicationV2);
}
function actorFromSheet(app){
  const actor=app?.actor??app?.document??app?.object;
  return actor?.documentName==="Actor"||actor?.constructor?.metadata?.name==="Actor"||actor?.type?actor:null;
}
function htmlElement(value){
  const HTMLElementClass=globalThis.HTMLElement;
  if(HTMLElementClass&&value instanceof HTMLElementClass)return value;
  if(HTMLElementClass&&value?.[0] instanceof HTMLElementClass)return value[0];
  return value?.querySelector?value:(value?.[0]?.querySelector?value[0]:null);
}
function reportActorEditorError(error){
  warn("Opening the Touched actor editor failed",error);
  ui.notifications?.error?.(game.i18n.format("OV.Notifications.ActionFailed",{action:"openTouchedActor",error:error?.message??String(error)}));
}
function launchActorEditor(actor){
  try{
    const result=openActorEditor(actor);
    if(result?.catch)result.catch(reportActorEditorError);
    return result;
  }catch(error){reportActorEditorError(error);return null;}
}
function addActorHeaderButton(app,buttons){
  if(!game.user?.isGM||isApplicationV2(app)||!Array.isArray(buttons))return;
  const actor=actorFromSheet(app);
  if(!actor)return;
  const className=`${MODULE_ID}-actor`;
  if(buttons.some(button=>String(button.class??button.className??"").split(/\s+/).includes(className)))return;
  buttons.unshift({
    label:game.i18n.localize("OV.ActorEditor.Button"),
    class:className,
    icon:"fas fa-eye",
    onclick:event=>{event?.preventDefault?.();event?.stopPropagation?.();return launchActorEditor(actor);}
  });
}
function addActorSheetFallback(app,html){
  if(!game.user?.isGM||!isApplicationV2(app))return;
  const actor=actorFromSheet(app),root=htmlElement(html)??htmlElement(app?.element);
  if(!actor||!root)return;
  const frame=root.matches?.(".application")?root:(root.closest?.(".application")??root);
  const header=frame.querySelector?.(".window-header")??root.querySelector?.(".window-header");
  if(!header)return;

  // Some system sheets still emit the legacy header-button hook while rendering
  // through ApplicationV2. Those controls display correctly but ignore `onclick`.
  // Remove the inert compatibility control and install one real DOM listener.
  for(const existing of header.querySelectorAll?.(`.${MODULE_ID}-actor`)??[]){
    if(existing.dataset?.ovActorButton!=="true")existing.remove();
  }
  if(header.querySelector?.("[data-ov-actor-button='true']"))return;

  const button=globalThis.document.createElement("button");
  button.type="button";
  button.dataset.ovActorButton="true";
  button.className=`header-control icon ${MODULE_ID}-actor`;
  button.title=game.i18n.localize("OV.ActorEditor.Button");
  button.setAttribute("aria-label",button.title);
  button.innerHTML='<i class="fa-solid fa-eye" aria-hidden="true"></i>';
  button.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    launchActorEditor(actor);
  });
  const close=header.querySelector?.(".window-close, [data-action='close']");
  if(close)close.before(button);else header.appendChild(button);
}
function hideCombatRows(app,html){if(game.user?.isGM&&!visibilityService.previewUserId)return;const root=html instanceof HTMLElement?html:html?.[0];if(!root)return;for(const combatant of game.combat?.combatants??[]){const token=combatant.token;if(!token||!repository.getOtherworldly(token).enabled)continue;const visible=visibilityService.evaluate(token).canSee;for(const row of root.querySelectorAll(`[data-combatant-id="${combatant.id}"], [data-entry-id="${combatant.id}"]`))row.classList.toggle("ov-combatant-hidden",!visible&&repository.getOtherworldly(token).hideCombatant);}}
function refreshToken(document){const token=document?.object;if(token)visibilityService.refreshToken(token);}

let sessionLogChain=Promise.resolve();
function appendLocalCueLog(cue,result){
  if(!game.user?.isGM)return;
  sessionLogChain=sessionLogChain.then(async()=>{
    const current=game.settings.get(MODULE_ID,SETTINGS.SESSION_LOG)??[];
    const row={at:new Date().toISOString(),direction:"local",id:cue?.id??null,type:"cueResult",issuerId:game.user.id,recipients:[game.user.id],setUuid:cue?.setUuid??null,status:result?.status??"unknown",source:cue?.source??null};
    await game.settings.set(MODULE_ID,SETTINGS.SESSION_LOG,[row,...current].slice(0,200));
  }).catch(error=>warn("Local cue journal update failed",error));
}

Hooks.once("init",()=>{registerSettings();registerKeybindings();triggerService.registerHooks();log(`Initializing ${MODULE_ID} ${MODULE_VERSION}`);});
Hooks.once("ready",async()=>{
  await migrateIfNeeded();
  const api=createApi(),module=game.modules.get(MODULE_ID);if(module)module.api=api;game.otherworldlyVisions=api;Hooks.callAll(`${MODULE_ID}.apiReady`,api);
  const mode=visibilityService.patchTokenVisibility();if(["unavailable","failed"].includes(mode))ui.notifications?.warn?.(game.i18n.localize("OV.Notifications.VisibilityPatchUnavailable"));
  scheduler.requestReconcile(0);document.addEventListener("visibilitychange",()=>scheduler.requestReconcile(0));await commandBus.publishStatus("ready",{safety:true,patchMode:mode});
});
Hooks.on("canvasReady",()=>{visibilityService.markSceneReady();visibilityService.profileCache.invalidate();tokenEffects.clear();visibilityService.refreshAll();scheduler.requestReconcile(100);});
Hooks.on("drawToken",token=>tokenEffects.reconcile(token));
Hooks.on(`${MODULE_ID}.visibilityChanged`,(token,evaluation)=>tokenEffects.reconcile(token,evaluation));
Hooks.on("refreshToken",token=>tokenEffects.reconcile(token));
Hooks.on("destroyToken",token=>{visibilityService.removeToken(token.document);tokenEffects.remove(token.document);});
Hooks.on("createToken",document=>{refreshToken(document);refreshManager();});
Hooks.on("updateToken",(document,changes)=>{refreshToken(document);if(["x","y","elevation","actorId"].some(key=>Object.hasOwn(changes,key))){visibilityService.profileCache.invalidate();visibilityService.refreshAllDebounced();}refreshManager();});
Hooks.on("deleteToken",document=>{visibilityService.removeToken(document);tokenEffects.remove(document);refreshManager();});
Hooks.on("updateActor",()=>{visibilityService.profileCache.invalidate();scheduler.requestReconcile(50);visibilityService.refreshAllDebounced();refreshEditors();refreshManager();});
Hooks.on("updateUser",()=>{visibilityService.profileCache.invalidate();scheduler.requestReconcile(50);visibilityService.refreshAllDebounced();refreshManager();});
Hooks.on("updateScene",()=>{visibilityService.profileCache.invalidate();visibilityService.refreshAllDebounced();});
Hooks.on(`${MODULE_ID}.afterCue`,(cue,result)=>{appendLocalCueLog(cue,result);if(result?.status==="shown")visibilityService.markCueSeen(cue);visibilityService.refreshAllDebounced();void commandBus.publishStatus("ready",{lastCueAt:Date.now(),lastCueStatus:result?.status,lastCueSetUuid:cue?.setUuid??null});});
Hooks.on("getSceneControlButtons",addSceneControlButton);
Hooks.on("renderTokenHUD",addTokenHudButton);
Hooks.on("getActorSheetHeaderButtons",addActorHeaderButton);
Hooks.on("renderActorSheet",addActorSheetFallback);
Hooks.on("renderActorSheetV2",addActorSheetFallback);
Hooks.on("renderCombatTracker",hideCombatRows);
Hooks.on("renderCombatTrackerV2",hideCombatRows);
Hooks.on("closeSettingsConfig",()=>void commandBus.publishStatus("ready",{safety:true}));
Hooks.on("shutdown",()=>{scheduler.stopAll();director.stopAll("shutdown");tokenEffects.clear();visibilityService.destroy();overlay.destroy();});
