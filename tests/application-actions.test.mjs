import test from "node:test";
import assert from "node:assert/strict";

class ApplicationV2 {
  async _onRender() {}
}
const HandlebarsApplicationMixin=Base=>class extends Base {};
globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin}}};
globalThis.game={users:[],i18n:{format:key=>key,localize:key=>key}};
globalThis.ui={notifications:{error(){},warn(){},info(){}}};

const { makeManagerClass }=await import(`../scripts/apps/manager.js?action-test=${Date.now()}`);

test("manager dispatches data-action handlers through its guarded ApplicationV2 bridge", async()=>{
  const Manager=makeManagerClass();
  let called=false;
  Manager.probe=async function(event,target){called=event.marker===7&&target.dataset.value==="ok";};
  const app=Object.create(Manager.prototype);
  const attributes=new Map();
  const target={dataset:{action:"probe",value:"ok"},isConnected:true,setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key)};
  let prevented=false;
  await app._onClickAction({marker:7,preventDefault(){prevented=true;}},target);
  assert.equal(called,true);
  assert.equal(prevented,true);
  assert.equal(target.dataset.busy,undefined);
  assert.equal(attributes.has("aria-busy"),false);
});

test("image picker opens with render(true) and returns the selected path", async()=>{
  let renderArgument=null;
  globalThis.FilePicker=class {
    constructor(options){this.options=options;}
    render(force){renderArgument=force;this.options.callback("folder/image.png");return this;}
    async close(){}
  };
  const Manager=makeManagerClass();
  const app={draft:{images:[]},syncDraft(){return this.draft;},render(){this.rendered=true;}};
  await Manager.addImage.call(app);
  assert.equal(renderArgument,true);
  assert.deepEqual(app.draft.images,["folder/image.png"]);
  assert.equal(app.rendered,true);
});


test("manager declares and manually preserves the actual set editor scroll container",()=>{
  const Manager=makeManagerClass();
  assert.ok(Manager.PARTS.body.scrollable.includes(".ov-set-workbench"));
  const node={dataset:{scrollKey:"sets-editor-demo"},scrollTop:640,scrollLeft:12};
  const app=Object.create(Manager.prototype);
  app._scrollState=new Map();
  app.element={querySelectorAll(){return [node];}};
  app.captureScrollState();
  node.scrollTop=0;node.scrollLeft=0;
  app.restoreScrollState();
  assert.equal(node.scrollTop,640);
  assert.equal(node.scrollLeft,12);
});
