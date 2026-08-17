import { getProperty } from "../utils.js";
export class ForbiddenLandsAdapter {
  get active(){return game.system?.id==="forbidden-lands";}
  get version(){return this.active?String(game.system?.version??"unknown"):null;}
  analyzeChatMessage(message){if(!this.active||!message)return[];const compact=JSON.stringify({flags:message.flags??{},rolls:message.rolls??[],flavor:message.flavor??"",content:message.content??""}).toLowerCase();const events=[];if(/\bpush(?:ed|ing)?\b|reroll|re-roll|дожим|переброс/.test(compact))events.push({type:"fblPush",event:"push"});if(/\bbane(?:s)?\b|skull|failure|череп|провал/.test(compact))events.push({type:"fblBane",event:"banes",banes:this.extractBanes(message,compact)});if(/spell|magic mishap|магическ|заклинан/.test(compact))events.push({type:"fblSpell",event:"spell"});if(/critical injury|critical-injury|критическ.*травм/.test(compact))events.push({type:"fblCritical",event:"critical-injury"});return this.deduplicate(events);}
  analyzeActorUpdate(actor,changes){if(!this.active||!actor||!changes)return[];const paths=["system.condition","system.conditions","system.attributes","system.stats","system.health","system.resource","system.resources"];return paths.some(path=>getProperty(changes,path)!==undefined)?[{type:"fblCondition",event:"actor-condition",actorId:actor.id}]:[];}
  extractBanes(message,compact){for(const value of [getProperty(message,"flags.forbidden-lands.banes"),getProperty(message,"flags.forbiddenlands.banes"),getProperty(message,"flags.forbidden-lands.roll.banes"),getProperty(message,"rolls.0.options.banes")]){const number=Number(value);if(Number.isFinite(number))return number;}const match=compact.match(/banes?[^0-9]{0,8}(\d+)/);return match?Number(match[1]):null;}
  deduplicate(events){const seen=new Set();return events.filter(event=>seen.has(event.type)?false:(seen.add(event.type),true));}
  snapshot(){return{id:"forbidden-lands",active:this.active,version:this.version};}
}
export const forbiddenLandsAdapter=new ForbiddenLandsAdapter();
