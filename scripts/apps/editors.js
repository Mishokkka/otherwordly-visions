import { MODULE_ID, SETTINGS } from "../constants.js";
import { normalizeCondition } from "../data/schemas.js";
import { repository } from "../data/repository.js";
import { applyWindowChrome, clampNumber, confirmDialog, randomId, unique, warn } from "../utils.js";
import { commandBus } from "../commands/command-bus.js";
import { director } from "../visions/director.js";
import { scheduler } from "../visions/scheduler.js";
import { visibilityService } from "../visibility/visibility-service.js";

const actorEditors=new Map();
const tokenEditors=new Map();
let safetyApp=null;

function notify(type,key,data={}){ const message=game.i18n.format(key,data); ui.notifications?.[type]?.(message); }
function bool(form,name){ return Boolean(form.querySelector(`[name="${name}"]`)?.checked); }
function value(form,name,fallback=""){ return form.querySelector(`[name="${name}"]`)?.value??fallback; }
function checkedValues(form,name){ return [...form.querySelectorAll(`[name="${name}"]:checked`)].map(input=>input.value); }
function optionRows(values,selected){ return values.map(([value,label])=>({value,label:game.i18n.localize(label),selected:value===selected})); }
function selectedRecipients(form){ return [...form.querySelectorAll("[name='recipientIds']:checked")].map(input=>input.value); }

function withSafeActions(Base){
  return class SafeActionApplication extends Base{
    constructor(...args){super(...args);this._ovDirty=false;}
    markDirty(){this._ovDirty=true;}
    markSaved(){this._ovDirty=false;}
    hasUnsavedChanges(){return Boolean(this._ovDirty);}
    async confirmDiscardChanges(){if(!this.hasUnsavedChanges())return true;return confirmDialog(game.i18n.localize("OV.Confirm.DiscardChangesTitle"),game.i18n.localize("OV.Confirm.DiscardEditorChangesBody"));}
    async _onRender(context,options){
      await super._onRender(context,options);
      applyWindowChrome(this);
      for(const input of this.element?.querySelectorAll?.("input[name], textarea[name], select[name]")??[]){if(input.name==="recipientIds")continue;input.addEventListener("input",()=>this.markDirty());input.addEventListener("change",()=>this.markDirty());}
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
      catch(error){const label=target.getAttribute?.("aria-label")||target.title||target.textContent?.trim()||action;warn(`Editor action ${action} failed`,error);notify("error","OV.Notifications.ActionFailed",{action:label,error:error?.message??String(error)});}
      finally{if(target.isConnected){delete target.dataset.busy;target.removeAttribute("aria-busy");}}
    }
  };
}

function conditionRows(conditions=[]){
  const types=[["scene","OV.Condition.Scene"],["targetRegion","OV.Condition.TargetRegion"],["viewerRegion","OV.Condition.ViewerRegion"],["targetElevation","OV.Condition.TargetElevation"],["viewerElevation","OV.Condition.ViewerElevation"],["actorProperty","OV.Condition.ActorProperty"],["user","OV.Condition.User"],["timeOnScene","OV.Condition.TimeOnScene"],["cueShown","OV.Condition.CueShown"]];
  const operators=[["in","OV.Operator.In"],["notIn","OV.Operator.NotIn"],["equals","OV.Operator.Equals"],["notEquals","OV.Operator.NotEquals"],["greater","OV.Operator.Greater"],["greaterOrEqual","OV.Operator.GreaterOrEqual"],["less","OV.Operator.Less"],["lessOrEqual","OV.Operator.LessOrEqual"],["contains","OV.Operator.Contains"]];
  return conditions.map(condition=>({...condition,valueText:Array.isArray(condition.value)?condition.value.join(", "):condition.value,typeChoices:optionRows(types,condition.type),operatorChoices:optionRows(operators,condition.operator)}));
}

function actorEligibility(actor){
  const total=(canvas?.tokens?.placeables??[]).length,documents=visibilityService.getOtherworldlyDocuments();let visible=Math.max(0,total-documents.length),eligible=0;
  for(const document of documents){const result=visibilityService.evaluateForActor(document,actor);if(result.canSee)visible+=1;if(result.actorResults?.[0]?.eligible)eligible+=1;}
  return {visible,eligible,total};
}

export function makeActorEditorClass(){
  const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
  const Base=withSafeActions(HandlebarsApplicationMixin(ApplicationV2));
  return class ActorEditor extends Base{
    constructor(actor,options={}){ super({...options,id:`${MODULE_ID}-actor-${actor.id}`}); this.actor=actor; }
    static DEFAULT_OPTIONS={id:`${MODULE_ID}-actor-editor`,classes:[MODULE_ID,"ov-editor","ov-actor-editor"],tag:"form",window:{title:"OV.ActorEditor.Title",icon:"fa-solid fa-eye"},position:{width:700,height:760},form:{handler:ActorEditor.submit,closeOnSubmit:false}};
    static PARTS={form:{template:`modules/${MODULE_ID}/templates/actor-editor.hbs`,scrollable:[".ov-actor-workspace"]}};
    async _prepareContext(){
      const touched=repository.getTouched(this.actor), stats=actorEligibility(this.actor);
      return {actor:this.actor,touched,tagsText:touched.tags.join(", "),revelations:visibilityService.getOtherworldlyDocuments().map(token=>({uuid:token.uuid,name:token.name,img:token.texture?.src??token.actor?.img,stage:Number(touched.revelations?.[token.uuid]??0),stages:[0,1,2,3,4,5].map(value=>({value,label:game.i18n.format("OV.Stage.Label",{stage:value}),selected:value===Number(touched.revelations?.[token.uuid]??0)}))})),sets:repository.getSets().map(set=>({uuid:set.uuid,name:set.name,checked:touched.visionSetUuids.includes(set.uuid),enabled:set.enabled})),stats,isGM:game.user.isGM};
    }
    static async submit(event,form){ return this.saveFrom(form); }
    static async save(event,target){ event.preventDefault(); return this.saveFrom(target.closest("form")??this.element); }
    async saveFrom(form){
      const revelations={...repository.getTouched(this.actor).revelations};for(const row of form.querySelectorAll("[data-revelation-token]")){const stage=Number(value(row,"revelationStage",0));if(stage>0)revelations[row.dataset.revelationToken]=stage;else delete revelations[row.dataset.revelationToken];}await repository.setTouched(this.actor,{enabled:bool(form,"enabled"),rank:value(form,"rank",1),tags:unique(value(form,"tags")),visionSetUuids:checkedValues(form,"visionSetUuids"),revelations});
      this.markSaved(); notify("info","OV.Notifications.ActorSaved",{name:this.actor.name}); this.render();
    }
    static async test(event,target){ const form=target.closest("form")??this.element; const setUuid=checkedValues(form,"visionSetUuids")[0]; if(!setUuid)return notify("warn","OV.Notifications.NoSetSelected"); await director.enqueueSet(setUuid,{source:"actor-editor-test",forced:true,conflict:"replace-lower"}); }
    static closeAction(){ return this.close(); }
    async close(options={}){ if(!await this.confirmDiscardChanges())return this; actorEditors.delete(this.actor.id); return super.close(options); }
  };
}

export function makeTokenEditorClass(){
  const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
  const Base=withSafeActions(HandlebarsApplicationMixin(ApplicationV2));
  return class TokenEditor extends Base{
    constructor(tokenDocument,options={}){ super({...options,id:`${MODULE_ID}-token-${tokenDocument.parent?.id??"scene"}-${tokenDocument.id}`}); this.tokenDocument=tokenDocument; }
    static DEFAULT_OPTIONS={id:`${MODULE_ID}-token-editor`,classes:[MODULE_ID,"ov-editor","ov-token-editor"],tag:"form",window:{title:"OV.TokenEditor.Title",icon:"fa-solid fa-ghost"},position:{width:720,height:820},form:{handler:TokenEditor.submit,closeOnSubmit:false}};
    static PARTS={form:{template:`modules/${MODULE_ID}/templates/token-editor.hbs`,scrollable:[".ov-editor-body"]}};
    async _prepareContext(){
      const otherworldly=repository.getOtherworldly(this.tokenDocument), result=visibilityService.evaluate(this.tokenDocument);
      return {token:this.tokenDocument,otherworldly,requiredTagsText:otherworldly.requiredTags.join(", "),conditions:conditionRows(otherworldly.conditions),result,effects:optionRows([["none","OV.Effect.None"],["void","OV.Effect.Void"],["warp","OV.Effect.Warp"],["pulse","OV.Effect.Pulse"],["spectral","OV.Effect.Spectral"]],otherworldly.visualEffect),stages:[0,1,2,3,4,5].map(value=>({value,label:game.i18n.format("OV.Stage.Label",{stage:value}),selected:value===otherworldly.revealStage})),isGM:game.user.isGM,users:[...(game.users??[])].filter(user=>!user.isGM).map(user=>({id:user.id,name:user.name,active:user.active}))};
    }
    collect(form){
      const conditions=[...form.querySelectorAll("[data-condition-id]")].map(row=>normalizeCondition({id:row.dataset.conditionId,enabled:bool(row,"conditionEnabled"),type:value(row,"conditionType"),operator:value(row,"conditionOperator"),path:value(row,"conditionPath"),value:value(row,"conditionValue")}));
      return {enabled:bool(form,"enabled"),requiredRank:value(form,"requiredRank",1),requiredTags:unique(value(form,"requiredTags")),viewerOpacity:value(form,"viewerOpacity",1),visualEffect:value(form,"visualEffect","void"),effectIntensity:value(form,"effectIntensity",1),revealStage:value(form,"revealStage",4),fullGhost:bool(form,"fullGhost"),suppressLight:bool(form,"suppressLight"),suppressVision:bool(form,"suppressVision"),hideCombatant:bool(form,"hideCombatant"),maxDistance:value(form,"maxDistance",0),requireLineOfSight:bool(form,"requireLineOfSight"),minDarkness:value(form,"minDarkness",0),maxDarkness:value(form,"maxDarkness",1),intermittentMinDelay:value(form,"intermittentMinDelay",5),intermittentMaxDelay:value(form,"intermittentMaxDelay",14),intermittentDuration:value(form,"intermittentDuration",1.5),conditions};
    }
    static async submit(event,form){return this.saveFrom(form);}
    static async save(event,target){event.preventDefault();return this.saveFrom(target.closest("form")??this.element);}
    async saveFrom(form){ await repository.setOtherworldly(this.tokenDocument,this.collect(form)); this.markSaved(); notify("info","OV.Notifications.TokenSaved",{name:this.tokenDocument.name}); this.render(); }
    static addCondition(event,target){ const form=target.closest("form")??this.element; const list=form.querySelector("[data-conditions]"); if(!list)return; const row=document.createElement("div"); row.className="ov-condition-row ov-inline-editor"; row.dataset.conditionId=randomId(10); row.innerHTML=`<label><input type="checkbox" name="conditionEnabled" checked> ${game.i18n.localize("OV.Common.Enabled")}</label><select name="conditionType"><option value="scene">${game.i18n.localize("OV.Condition.Scene")}</option><option value="targetRegion">${game.i18n.localize("OV.Condition.TargetRegion")}</option><option value="viewerRegion">${game.i18n.localize("OV.Condition.ViewerRegion")}</option><option value="targetElevation">${game.i18n.localize("OV.Condition.TargetElevation")}</option><option value="viewerElevation">${game.i18n.localize("OV.Condition.ViewerElevation")}</option><option value="actorProperty">${game.i18n.localize("OV.Condition.ActorProperty")}</option><option value="user">${game.i18n.localize("OV.Condition.User")}</option><option value="timeOnScene">${game.i18n.localize("OV.Condition.TimeOnScene")}</option><option value="cueShown">${game.i18n.localize("OV.Condition.CueShown")}</option></select><select name="conditionOperator"><option value="in">${game.i18n.localize("OV.Operator.In")}</option><option value="notIn">${game.i18n.localize("OV.Operator.NotIn")}</option><option value="equals">${game.i18n.localize("OV.Operator.Equals")}</option><option value="notEquals">${game.i18n.localize("OV.Operator.NotEquals")}</option><option value="greater">${game.i18n.localize("OV.Operator.Greater")}</option><option value="greaterOrEqual">${game.i18n.localize("OV.Operator.GreaterOrEqual")}</option><option value="less">${game.i18n.localize("OV.Operator.Less")}</option><option value="lessOrEqual">${game.i18n.localize("OV.Operator.LessOrEqual")}</option><option value="contains">${game.i18n.localize("OV.Operator.Contains")}</option></select><input name="conditionPath" placeholder="system.path"><input name="conditionValue" placeholder="id, value"><button type="button" data-action="removeCondition" class="icon" title="${game.i18n.localize("OV.Common.Delete")}" aria-label="${game.i18n.localize("OV.Common.Delete")}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`; list.appendChild(row); this.markDirty(); }
    static removeCondition(event,target){ const row=target.closest("[data-condition-id]");if(!row)return;row.remove();this.markDirty(); }
    static async manifest(event,target){ const recipients=selectedRecipients(target.closest("form")??this.element); if(recipients.length)await commandBus.dispatchManifest(this.tokenDocument.uuid,2500,recipients); else visibilityService.forceManifest(this.tokenDocument,2500); }
    static closeAction(){return this.close();}
    async close(options={}){if(!await this.confirmDiscardChanges())return this;tokenEditors.delete(this.tokenDocument.uuid);return super.close(options);}
  };
}

export function makeSafetyAppClass(){
  const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
  const Base=withSafeActions(HandlebarsApplicationMixin(ApplicationV2));
  return class SafetyApp extends Base{
    static DEFAULT_OPTIONS={id:`${MODULE_ID}-safety`,classes:[MODULE_ID,"ov-editor","ov-safety"],tag:"form",window:{title:"OV.Safety.Title",icon:"fa-solid fa-shield-heart"},position:{width:560,height:"auto"},form:{handler:SafetyApp.submit,closeOnSubmit:false}};
    static PARTS={form:{template:`modules/${MODULE_ID}/templates/safety.hbs`}};
    async _prepareContext(){return{enabled:game.settings.get(MODULE_ID,SETTINGS.PLAYER_FLASH),volumeCap:game.settings.get(MODULE_ID,SETTINGS.VOLUME_CAP),opacityCap:game.settings.get(MODULE_ID,SETTINGS.OPACITY_CAP),reducedMotion:game.settings.get(MODULE_ID,SETTINGS.REDUCED_MOTION),photosensitive:game.settings.get(MODULE_ID,SETTINGS.PHOTOSENSITIVE),blockedTags:(game.settings.get(MODULE_ID,SETTINGS.BLOCKED_SAFETY_TAGS)??[]).join(", "),allowHidden:game.settings.get(MODULE_ID,SETTINGS.ALLOW_HIDDEN),minimumInterval:game.settings.get(MODULE_ID,SETTINGS.MIN_INTERVAL),emergencyMute:game.settings.get(MODULE_ID,SETTINGS.EMERGENCY_MUTE)};}
    static async submit(event,form){return this.saveFrom(form);}
    static async save(event,target){event.preventDefault();return this.saveFrom(target.closest("form")??this.element);}
    async saveFrom(form){for(const [key,val] of [[SETTINGS.PLAYER_FLASH,bool(form,"enabled")],[SETTINGS.VOLUME_CAP,clampNumber(value(form,"volumeCap"),0,1,1)],[SETTINGS.OPACITY_CAP,clampNumber(value(form,"opacityCap"),.05,1,1)],[SETTINGS.REDUCED_MOTION,bool(form,"reducedMotion")],[SETTINGS.PHOTOSENSITIVE,bool(form,"photosensitive")],[SETTINGS.BLOCKED_SAFETY_TAGS,unique(value(form,"blockedTags"))],[SETTINGS.ALLOW_HIDDEN,bool(form,"allowHidden")],[SETTINGS.MIN_INTERVAL,clampNumber(value(form,"minimumInterval"),0,3600,0)]]){const current=game.settings.get(MODULE_ID,key);if(JSON.stringify(current)!==JSON.stringify(val))await game.settings.set(MODULE_ID,key,val);}scheduler.requestReconcile(0);await commandBus.publishStatus("ready",{safety:true});this.markSaved();notify("info","OV.Notifications.SafetySaved");this.render();}
    static async test(){await director.enqueuePayload({image:"",audio:"",caption:game.i18n.localize("OV.Safety.TestCaption"),duration:900,opacity:.7,safety:[]},{source:"safety-test",conflict:"replace",priority:100});}
    static async emergency(){const next=!game.settings.get(MODULE_ID,SETTINGS.EMERGENCY_MUTE);await game.settings.set(MODULE_ID,SETTINGS.EMERGENCY_MUTE,next);director.stopAll("emergency-mute");if(this.hasUnsavedChanges()){const status=this.element?.querySelector?.(".ov-emergency"),label=status?.querySelector?.("span");status?.classList?.toggle?.("is-active",next);if(label)label.textContent=game.i18n.localize(next?"OV.Common.Enabled":"OV.Common.Disabled");}else this.render();}
    async close(options={}){if(!await this.confirmDiscardChanges())return this;if(safetyApp===this)safetyApp=null;return super.close(options);}
  };
}

export function openActorEditor(actor){if(!game.user?.isGM)return ui.notifications?.warn?.(game.i18n.localize("OV.Notifications.GMOnly"));if(!actor)return;let app=actorEditors.get(actor.id);if(!app){const Cls=makeActorEditorClass();app=new Cls(actor);actorEditors.set(actor.id,app);}if(app.rendered&&app.hasUnsavedChanges?.()){app.bringToFront?.();return app;}return app.render(true);}
export function openTokenEditor(tokenOrDocument){if(!game.user?.isGM)return ui.notifications?.warn?.(game.i18n.localize("OV.Notifications.GMOnly"));const document=tokenOrDocument?.document??tokenOrDocument;if(!document)return;let app=tokenEditors.get(document.uuid);if(!app){const Cls=makeTokenEditorClass();app=new Cls(document);tokenEditors.set(document.uuid,app);}if(app.rendered&&app.hasUnsavedChanges?.()){app.bringToFront?.();return app;}return app.render(true);}
export function openSafety(){if(!safetyApp){const Cls=makeSafetyAppClass();safetyApp=new Cls();}if(safetyApp.rendered&&safetyApp.hasUnsavedChanges?.()){safetyApp.bringToFront?.();return safetyApp;}return safetyApp.render(true);}
export function refreshEditors({actor=null,tokenDocument=null,safety=false}={}){
  const apps=[];if(actor)apps.push(actorEditors.get(actor.id));else if(tokenDocument)apps.push(tokenEditors.get(tokenDocument.uuid));else apps.push(...actorEditors.values(),...tokenEditors.values());
  for(const app of apps)if(app?.rendered&&!app.hasUnsavedChanges?.())app.render();if((safety||!actor&&!tokenDocument)&&safetyApp?.rendered&&!safetyApp.hasUnsavedChanges?.())safetyApp.render();
}

export async function closeEditorsFor({actor=null,tokenDocument=null}={}){
  const apps=[];
  if(actor){const app=actorEditors.get(actor.id);if(app)apps.push(app);}
  if(tokenDocument){const document=tokenDocument?.document??tokenDocument;const app=tokenEditors.get(document?.uuid);if(app)apps.push(app);}
  for(const app of apps){app.markSaved?.();try{await app.close();}catch(error){warn("Failed to close editor for deleted document",error);}}
}
