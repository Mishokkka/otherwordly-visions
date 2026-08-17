import { CONFLICT, FLAGS, MODULE_ID, MODULE_VERSION, PRIORITY, SETTINGS } from "../constants.js";
import { repository } from "../data/repository.js";
import { clone, randomId, requireGM, sanitizeRemoteOptions, unique, warn } from "../utils.js";
import { visibilityService } from "../visibility/visibility-service.js";
import { director } from "../visions/director.js";
import { scheduler } from "../visions/scheduler.js";

export class CommandBus {
  constructor(){this.processed=new Set();this.lastCommand=null;this.errors=[];this.receivedAt=[];this.logChain=Promise.resolve();}
  async dispatch(type,payload={},recipients=[],{ttlMs=20000}={}){requireGM("dispatch remote cues");const now=Date.now();const envelope={schemaVersion:1,id:randomId(20),type:String(type),payload:clone(payload),recipients:unique(recipients),issuerId:game.user.id,issuedAt:now,expiresAt:now+ttlMs};await game.settings.set(MODULE_ID,SETTINGS.COMMAND,envelope);await this.appendSessionLog({direction:"out",...envelope});return envelope;}
  async publishStatus(state,details={}){try{const status={moduleVersion:MODULE_VERSION,state:String(state),lastSeen:Date.now(),sceneId:canvas?.scene?.id??null,...clone(details)};await game.user?.setFlag?.(MODULE_ID,FLAGS.CLIENT_STATUS,status);return status;}catch(error){warn("Client status update failed",error);return null;}}
  dispatchSet(setUuid,recipients,options={}){if(!repository.getSet(setUuid))throw new Error("Vision set not found.");return this.dispatch("cueSet",{setUuid,options:sanitizeRemoteOptions({...options,source:"gm-remote",priority:PRIORITY.MANUAL,conflict:options.conflict??CONFLICT.REPLACE_LOWER,forced:true})},recipients);}
  dispatchAsset(setUuid,asset,recipients,options={}){if(!repository.getSet(setUuid))throw new Error("Vision set not found.");return this.dispatch("cueAsset",{setUuid,asset:{image:typeof asset?.image==="string"?asset.image:"",audio:typeof asset?.audio==="string"?asset.audio:"",caption:typeof asset?.caption==="string"?asset.caption.slice(0,500):""},options:sanitizeRemoteOptions(options)},recipients);}
  dispatchStopAll(recipients){return this.dispatch("stopAll",{},recipients);}
  dispatchSyncScheduler(recipients){return this.dispatch("syncScheduler",{},recipients);}
  dispatchManifest(tokenUuid,durationMs,recipients){return this.dispatch("manifestToken",{tokenUuid,durationMs:Math.min(60000,Math.max(100,Number(durationMs)||2000))},recipients);}
  async receive(envelope){
    if(!envelope?.id||!envelope.type||this.processed.has(envelope.id))return;this.processed.add(envelope.id);while(this.processed.size>200)this.processed.delete(this.processed.values().next().value);
    const now=Date.now();if(Number(envelope.expiresAt)<now||Number(envelope.issuedAt)>now+30000)return;const issuer=game.users?.get(envelope.issuerId);if(!issuer?.isGM){this.errors.push({at:new Date().toISOString(),reason:"non-gm-issuer",id:envelope.id});return;}const recipients=unique(envelope.recipients);if(recipients.length&&!recipients.includes(game.user.id))return;
    this.receivedAt=this.receivedAt.filter(at=>now-at<10000);if(this.receivedAt.length>=50){this.errors.push({at:new Date().toISOString(),reason:"rate-limit",id:envelope.id});return;}this.receivedAt.push(now);
    this.lastCommand={id:envelope.id,type:envelope.type,issuerId:envelope.issuerId,issuedAt:envelope.issuedAt};await this.publishStatus("processing",{lastCommandId:envelope.id,commandType:envelope.type});
    try{let outcome={status:"processed"};switch(envelope.type){
      case"cueSet":{const set=repository.getSet(envelope.payload?.setUuid);if(!set)throw new Error("Vision set not found.");const options=sanitizeRemoteOptions(envelope.payload?.options??{});outcome=await director.enqueueSet(set,{...options,forced:true,source:"gm-remote",priority:PRIORITY.MANUAL,conflict:options.conflict??CONFLICT.REPLACE_LOWER});break;}
      case"cueAsset":{const set=repository.getSet(envelope.payload?.setUuid);if(!set)throw new Error("Vision set not found.");const asset=envelope.payload?.asset??{};const images=new Set([...(set.images??[]),...(set.entries??[]).map(e=>e.image),...(set.sequence??[]).map(s=>s.image)].filter(Boolean));const playlistAudio=[];for(const id of set.playlistIds??[]){const playlist=game.playlists?.get?.(id);for(const sound of playlist?.sounds?.contents??playlist?.sounds??[]){const path=sound?.path??sound?.src;if(path)playlistAudio.push(path);}}const audio=new Set([...(set.audio??[]),...(set.entries??[]).map(e=>e.audio),...(set.sequence??[]).map(s=>s.audio),...playlistAudio].filter(Boolean));if(asset.image&&!images.has(asset.image)||asset.audio&&!audio.has(asset.audio))throw new Error("Requested asset is not part of the selected vision set.");const options=sanitizeRemoteOptions(envelope.payload?.options??{});outcome=await director.enqueuePayload(director.buildAssetPayload(set,asset),{...options,setUuid:set.uuid,setName:set.name,source:"gm-remote-asset",priority:PRIORITY.MANUAL,conflict:options.conflict??CONFLICT.REPLACE_LOWER});break;}
      case"stopAll":director.stopAll("remote-stop");outcome={status:"stopped"};break;
      case"syncScheduler":scheduler.requestReconcile(0);outcome={status:"synchronized"};break;
      case"manifestToken":{const token=canvas?.scene?.tokens?.contents?.find(document=>document.uuid===envelope.payload?.tokenUuid);if(!token)throw new Error("Manifest token not found on the current scene.");visibilityService.forceManifest(token,envelope.payload.durationMs);outcome={status:"manifested",tokenUuid:token.uuid};break;}
      default:throw new Error(`Unknown command: ${envelope.type}`);
    }await this.publishStatus("ready",{lastCommandId:envelope.id,commandType:envelope.type,outcome:clone(outcome)});}catch(error){this.errors.push({at:new Date().toISOString(),reason:String(error?.message??error),type:envelope.type});warn("Command processing failed",envelope.type,error);await this.publishStatus("error",{lastCommandId:envelope.id,commandType:envelope.type,error:String(error?.message??error).slice(0,300)});}
  }
  async appendSessionLog(entry){this.logChain=this.logChain.then(async()=>{const current=game.settings.get(MODULE_ID,SETTINGS.SESSION_LOG)??[];const row={at:new Date().toISOString(),direction:entry.direction,id:entry.id,type:entry.type,issuerId:entry.issuerId,recipients:entry.recipients,setUuid:entry.payload?.setUuid??null};await game.settings.set(MODULE_ID,SETTINGS.SESSION_LOG,[row,...current].slice(0,200));}).catch(error=>warn("Session log update failed",error));return this.logChain;}
  snapshot(){return{transport:"gm-world-setting-bus",lastCommand:clone(this.lastCommand),recentErrors:clone(this.errors.slice(-20)),processed:this.processed.size};}
}
export const commandBus=new CommandBus();
