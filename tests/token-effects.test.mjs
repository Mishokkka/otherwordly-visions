import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, SETTINGS } from "../scripts/constants.js";

test("token effect signature changes when ghost/light/vision suppression changes",async()=>{
  globalThis.game={settings:{get(scope,key){assert.equal(scope,MODULE_ID);if(key===SETTINGS.OPACITY_CAP)return 1;return undefined;}}};
  const { TokenEffects }=await import(`../scripts/visibility/token-effects.js?signature=${Date.now()}`);
  const effects=new TokenEffects(),result={stage:4,canSee:true};
  const base={enabled:true,visualEffect:"void",effectIntensity:1,viewerOpacity:1,fullGhost:true,suppressLight:true,suppressVision:true};
  const signature=effects.signature(base,result);
  assert.notEqual(effects.signature({...base,fullGhost:false},result),signature);
  assert.notEqual(effects.signature({...base,suppressLight:false},result),signature);
  assert.notEqual(effects.signature({...base,suppressVision:false},result),signature);
});
