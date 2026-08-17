import test from "node:test";
import assert from "node:assert/strict";

const { applyWindowChrome } = await import(`../scripts/utils.js?window-chrome=${Date.now()}`);

test("module window chrome installs a classic cross and scopes the outer frame", () => {
  globalThis.game={i18n:{localize:()=>"Close"}};
  const frameClasses=new Set();
  const closeClasses=new Set(["header-control","fa-solid","fa-circle"]);
  const attrs=new Map();
  const close={
    classList:{
      add:value=>closeClasses.add(value),
      remove:value=>closeClasses.delete(value),
      [Symbol.iterator]:function*(){yield* closeClasses;}
    },
    innerHTML:"<i class=\"fa-circle\"></i>",
    setAttribute:(key,value)=>attrs.set(key,value)
  };
  const frame={
    classList:{add:value=>frameClasses.add(value)},
    querySelector:()=>close
  };
  const element={matches:()=>false,closest:()=>frame};
  const result=applyWindowChrome({element});
  assert.equal(result,frame);
  assert.equal(frameClasses.has("otherworldly-visions"),true);
  assert.equal(closeClasses.has("ov-classic-close"),true);
  assert.equal(closeClasses.has("fa-solid"),false);
  assert.equal(closeClasses.has("fa-circle"),false);
  assert.equal(closeClasses.has("header-control"),true);
  assert.match(close.innerHTML,/ov-close-glyph/);
  assert.match(close.innerHTML,/×/);
  assert.equal(attrs.get("aria-label"),"Close");
});
