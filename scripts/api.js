import { CONFLICT, MODULE_ID, MODULE_VERSION, PRIORITY } from "./constants.js";
import { commandBus } from "./commands/command-bus.js";
import { repository } from "./data/repository.js";
import { clone, requireGM, sanitizeRemoteOptions } from "./utils.js";
import { openActorEditor, openSafety, openTokenEditor } from "./apps/editors.js";
import { openManager } from "./apps/manager.js";
import { triggerService } from "./triggers/trigger-service.js";
import { director } from "./visions/director.js";
import { scheduler } from "./visions/scheduler.js";
import { visibilityService } from "./visibility/visibility-service.js";

export function createApi(){
  const api={
    version:MODULE_VERSION,
    hooks:Object.freeze({apiReady:`${MODULE_ID}.apiReady`,beforeCue:`${MODULE_ID}.beforeCue`,afterCue:`${MODULE_ID}.afterCue`,visibilityChanged:`${MODULE_ID}.visibilityChanged`,schedulerChanged:`${MODULE_ID}.schedulerChanged`}),
    openManager,openSafety,openActorEditor,openTokenEditor,
    getState:()=>clone(repository.getState()),
    getSets:()=>clone(repository.getSets()),
    getSet:reference=>clone(repository.findSet(reference)),
    getTouched:actor=>clone(repository.getTouched(actor)),
    getOtherworldly:token=>clone(repository.getOtherworldly(token)),
    evaluateVisibility:(token,user)=>clone(visibilityService.evaluate(token,user)),
    getDirectorState:()=>clone(director.snapshot()),
    getSchedulerState:()=>clone(scheduler.snapshot()),
    async cueLocal(reference,options={}){const set=repository.findSet(reference);if(!set)throw new Error("Vision set not found.");return director.enqueueSet(set,{...sanitizeRemoteOptions(options),source:options.source??"api-local",priority:options.priority??PRIORITY.MANUAL,conflict:options.conflict??CONFLICT.REPLACE_LOWER,forced:options.forced??true});},
    async cuePayloadLocal(payload,options={}){return director.enqueuePayload(payload,{...sanitizeRemoteOptions(options),source:options.source??"api-payload",priority:options.priority??PRIORITY.MANUAL,conflict:options.conflict??CONFLICT.REPLACE_LOWER});},
    async cueFor(reference,userIds,options={}){requireGM("send a vision cue");const set=repository.findSet(reference);if(!set)throw new Error("Vision set not found.");return commandBus.dispatchSet(set.uuid,userIds,options);},
    async cueAssetFor(reference,asset,userIds,options={}){requireGM("send a vision asset");const set=repository.findSet(reference);if(!set)throw new Error("Vision set not found.");return commandBus.dispatchAsset(set.uuid,asset,userIds,options);},
    stopLocal:reason=>director.stopAll(reason??"api-stop"),
    async stopFor(userIds){requireGM("stop remote cues");return commandBus.dispatchStopAll(userIds);},
    async setTouched(actor,patch){requireGM("change Touched actor data");const result=await repository.setTouched(actor,patch);visibilityService.profileCache.invalidate();scheduler.requestReconcile(0);visibilityService.refreshAllDebounced();return clone(result);},
    async setRevelation(actor,tokenUuid,stage){requireGM("change revelation progress");const result=await repository.setRevelation(actor,tokenUuid,stage);visibilityService.profileCache.invalidate();visibilityService.refreshAllDebounced();return clone(result);},
    async setOtherworldly(token,patch){requireGM("change Otherworldly token data");const result=await repository.setOtherworldly(token,patch);const document=token?.document??token;visibilityService.refreshToken(document?.object);return clone(result);},
    async upsertSet(set,options={}){requireGM("change vision sets");const result=await repository.upsertSet(set,options);scheduler.requestReconcile(0);return clone(result);},
    async deleteSet(uuid,options={}){requireGM("delete vision sets");const result=await repository.deleteSet(uuid,options);scheduler.requestReconcile(0);return clone(result);},
    async fireTrigger(type,context={}){return triggerService.fire(type,context,{allowGM:true});},
    manifestLocal(token,durationMs=2000){visibilityService.forceManifest(token,durationMs);},
    async manifestFor(token,userIds,durationMs=2000){requireGM("manifest a remote token");const document=token?.document??token;return commandBus.dispatchManifest(document.uuid,durationMs,userIds);},
    previewAs(userId=null){requireGM("preview token visibility");visibilityService.setPreviewUser(userId);},
    refreshVisibility(){visibilityService.profileCache.invalidate();visibilityService.refreshAll();},
    resetSession(){director.resetSession();visibilityService.resetSessionMemory();triggerService.reset();scheduler.requestReconcile(0);},
    exportSets:()=>repository.exportData(),
    importSets:(payload,options={})=>repository.importData(payload,options),
    repairOrphans:()=>repository.repairOrphans()
  };
  Object.defineProperties(api,{visionSets:{get:()=>api.getSets()},showVision:{value:api.cueLocal},showVisionToUsers:{value:api.cueFor}});
  return Object.freeze(api);
}
