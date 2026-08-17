import { getProperty } from "../utils.js";

const DAMAGE_ATTRIBUTES=["strength","agility","wits","empathy","health","resolve"];

function changedValue(changes,path){
  if(!changes||typeof changes!=="object")return undefined;
  if(Object.hasOwn(changes,path))return changes[path];
  const nested=getProperty(changes,path);
  if(nested!==undefined)return nested;
  for(const [key,value] of Object.entries(changes)){
    if(!path.startsWith(`${key}.`))continue;
    const descendant=getProperty(value,path.slice(key.length+1));
    if(descendant!==undefined)return descendant;
  }
  return undefined;
}
function changedPath(changes,path){
  if(changedValue(changes,path)!==undefined)return true;
  return Object.keys(changes??{}).some(key=>key===path||key.startsWith(`${path}.`));
}

export class ForbiddenLandsAdapter {
  constructor(){this.attributeValues=new Map();}
  get active(){return game.system?.id==="forbidden-lands";}
  get version(){return this.active?String(game.system?.version??"unknown"):null;}
  attributeSnapshot(actor){
    const snapshot={};
    for(const key of DAMAGE_ATTRIBUTES){const number=Number(getProperty(actor,`system.attribute.${key}.value`));if(Number.isFinite(number))snapshot[key]=number;}
    return snapshot;
  }
  primeActor(actor){if(!actor?.id)return;this.attributeValues.set(actor.id,this.attributeSnapshot(actor));}
  primeActors(actors=game.actors??[]){this.attributeValues.clear();for(const actor of actors)this.primeActor(actor);}
  forgetActor(actor){if(actor?.id)this.attributeValues.delete(actor.id);}
  analyzeChatMessage(message){if(!this.active||!message)return[];const compact=JSON.stringify({flags:message.flags??{},rolls:message.rolls??[],flavor:message.flavor??"",content:message.content??""}).toLowerCase();const events=[];if(/\bpush(?:ed|ing)?\b|reroll|re-roll|дожим|переброс/.test(compact))events.push({type:"fblPush",event:"push"});if(/\bbane(?:s)?\b|skull|failure|череп|провал/.test(compact))events.push({type:"fblBane",event:"banes",banes:this.extractBanes(message,compact)});if(/spell|magic mishap|магическ|заклинан/.test(compact))events.push({type:"fblSpell",event:"spell"});if(/critical injury|critical-injury|критическ.*травм/.test(compact))events.push({type:"fblCritical",event:"critical-injury"});return this.deduplicate(events);}
  analyzeActorUpdate(actor,changes){
    if(!this.active||!actor||!changes)return[];
    const previous=this.attributeValues.get(actor.id),current=this.attributeSnapshot(actor),events=[];
    if(previous){
      const damaged=[];
      for(const attribute of DAMAGE_ATTRIBUTES){
        if(changedValue(changes,`system.attribute.${attribute}.value`)===undefined)continue;
        const before=Number(previous[attribute]),after=Number(current[attribute]);
        if(Number.isFinite(before)&&Number.isFinite(after)&&after<before)damaged.push({attribute,previous:before,value:after,damage:before-after});
      }
      if(damaged.length){const first=damaged[0];events.push({type:"fblDamage",event:"damage",actorId:actor.id,attribute:damaged.length===1?first.attribute:null,previous:damaged.length===1?first.previous:null,value:damaged.length===1?first.value:null,damage:damaged.reduce((sum,row)=>sum+row.damage,0),attributes:damaged});}
    }
    this.attributeValues.set(actor.id,current);
    const paths=["system.condition","system.conditions","system.attributes","system.attribute","system.stats","system.health","system.resource","system.resources"];
    if(paths.some(path=>changedPath(changes,path)))events.push({type:"fblCondition",event:"actor-condition",actorId:actor.id});
    return events;
  }
  extractBanes(message,compact){for(const value of [getProperty(message,"flags.forbidden-lands.banes"),getProperty(message,"flags.forbiddenlands.banes"),getProperty(message,"flags.forbidden-lands.roll.banes"),getProperty(message,"rolls.0.options.banes")]){const number=Number(value);if(Number.isFinite(number))return number;}const match=compact.match(/banes?[^0-9]{0,8}(\d+)/);return match?Number(match[1]):null;}
  deduplicate(events){const seen=new Set();return events.filter(event=>seen.has(event.type)?false:(seen.add(event.type),true));}
  snapshot(){return{id:"forbidden-lands",active:this.active,version:this.version,trackedActors:this.attributeValues.size};}
}
export const forbiddenLandsAdapter=new ForbiddenLandsAdapter();
