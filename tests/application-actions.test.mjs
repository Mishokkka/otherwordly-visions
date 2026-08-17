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

test("manager asks before discarding a dirty vision-set draft",async()=>{
  let confirms=0;
  globalThis.foundry.applications.api.DialogV2={confirm:async()=>{confirms+=1;return false;}};
  globalThis.game.i18n={format:key=>key,localize:key=>key};
  const Manager=makeManagerClass();
  const app=Object.create(Manager.prototype);
  app.draft={uuid:"set-a",name:"Changed"};
  app.original={uuid:"set-a",name:"Saved"};
  app.element=null;
  const allowed=await app.confirmDiscardDraft();
  assert.equal(allowed,false);
  assert.equal(confirms,1);
});

test("manager keeps exactly one root drop listener across repeated renders",async()=>{
  const Manager=makeManagerClass();
  const app=Object.create(Manager.prototype);
  let adds=0,removes=0;
  const root={
    matches(){return false;},closest(){return null;},querySelector(){return null;},querySelectorAll(){return[];},
    addEventListener(type){if(type==="drop")adds+=1;},removeEventListener(type){if(type==="drop")removes+=1;}
  };
  app.element=root;app._dropRoot=null;app._dropHandler=()=>{};app._scrollState=new Map();app._draftSyncTimer=null;
  await app._onRender({},{});
  await app._onRender({},{});
  assert.equal(adds,1);
  assert.equal(removes,0);
});

test("manager reloads a clean selected-set draft after an external persisted update",async()=>{
  const { repository }=await import("../scripts/data/repository.js");
  const originalGetState=repository.getState.bind(repository);
  const persisted={uuid:"set-a",name:"Remote edit",slug:"remote",legacyIds:[],enabled:true,safety:[],images:[],audio:[],playlistIds:[],entries:[],sequence:[],triggers:[]};
  repository.getState=()=>({revision:9,sets:{"set-a":persisted}});
  try{
    const Manager=makeManagerClass();
    const app=Object.create(Manager.prototype);
    app.selectedSetUuid="set-a";
    app.original={...persisted,name:"Old"};
    app.draft=structuredClone(app.original);
    app.originalRevision=8;
    app.ensureDraft();
    assert.equal(app.draft.name,"Remote edit");
    assert.equal(app.original.name,"Remote edit");
    assert.equal(app.originalRevision,9);
  }finally{repository.getState=originalGetState;}
});

test("manager preserves a dirty selected-set draft across an external persisted update",async()=>{
  const { repository }=await import("../scripts/data/repository.js");
  const originalGetState=repository.getState.bind(repository);
  const persisted={uuid:"set-a",name:"Remote edit",slug:"remote",legacyIds:[],enabled:true,safety:[],images:[],audio:[],playlistIds:[],entries:[],sequence:[],triggers:[]};
  repository.getState=()=>({revision:9,sets:{"set-a":persisted}});
  try{
    const Manager=makeManagerClass();
    const app=Object.create(Manager.prototype);
    app.selectedSetUuid="set-a";
    app.original={...persisted,name:"Old"};
    app.draft={...app.original,name:"Local dirty edit"};
    app.originalRevision=8;
    app.ensureDraft();
    assert.equal(app.draft.name,"Local dirty edit");
    assert.equal(app.original.name,"Old");
    assert.equal(app.originalRevision,8);
  }finally{repository.getState=originalGetState;}
});

test("manager clears a clean draft when its selected set is externally deleted",async()=>{
  const { repository }=await import("../scripts/data/repository.js");
  const originalGetState=repository.getState.bind(repository);
  repository.getState=()=>({revision:12,sets:{}});
  try{
    const Manager=makeManagerClass();
    const app=Object.create(Manager.prototype);
    app.selectedSetUuid="set-a";
    app.original={uuid:"set-a",name:"Saved"};
    app.draft=structuredClone(app.original);
    app.originalRevision=11;
    app.ensureDraft();
    assert.equal(app.selectedSetUuid,null);
    assert.equal(app.draft,null);
    assert.equal(app.original,null);
    assert.equal(app.originalRevision,12);
  }finally{repository.getState=originalGetState;}
});

test("asset scan discards results and progress after switching away from the scanned draft",async()=>{
  const { mediaCache }=await import("../scripts/visions/media-cache.js");
  const originalScanSet=mediaCache.scanSet.bind(mediaCache);
  let finish,onProgress;
  mediaCache.scanSet=async(_set,progress)=>{
    onProgress=progress;
    return await new Promise(resolve=>{finish=resolve;});
  };
  try{
    const Manager=makeManagerClass();
    const app=Object.create(Manager.prototype);
    app.selectedSetUuid="set-a";
    app.draft={uuid:"set-a",name:"A"};
    app.original=structuredClone(app.draft);
    app.syncDraft=function(){return this.draft;};
    app.rendered=true;
    app.render=function(){this.renderCount=(this.renderCount??0)+1;};
    app.element={querySelector(){return null;}};
    app.scanResults=[];
    app.scanProgress=null;
    app._assetScanToken=null;
    const pending=Manager.scanAssets.call(app);
    app.selectedSetUuid="set-b";
    app.draft={uuid:"set-b",name:"B"};
    app.invalidateAssetScan({clearResults:true});
    onProgress({completed:1,total:2});
    assert.equal(app.scanProgress,null,"stale progress callbacks must not restore progress after a set switch");
    finish([{path:"old.png",ok:true}]);
    await pending;
    assert.deepEqual(app.scanResults,[]);
    assert.equal(app.scanProgress,null);
  }finally{mediaCache.scanSet=originalScanSet;}
});

test("clearing the media cache invalidates an active asset scan",async()=>{
  const { mediaCache }=await import("../scripts/visions/media-cache.js");
  const originalScanSet=mediaCache.scanSet.bind(mediaCache),originalClear=mediaCache.clear.bind(mediaCache);
  let finish;let clears=0;
  mediaCache.scanSet=async()=>await new Promise(resolve=>{finish=resolve;});
  mediaCache.clear=()=>{clears+=1;};
  try{
    const Manager=makeManagerClass();
    const app=Object.create(Manager.prototype);
    app.selectedSetUuid="set-a";
    app.draft={uuid:"set-a",name:"A"};
    app.original=structuredClone(app.draft);
    app.syncDraft=function(){return this.draft;};
    app.rendered=true;
    app.render=function(){this.renderCount=(this.renderCount??0)+1;};
    app.element={querySelector(){return null;}};
    app.scanResults=[];app.scanProgress=null;app._assetScanToken=null;
    const pending=Manager.scanAssets.call(app);
    Manager.clearMediaCache.call(app);
    assert.equal(clears,1);
    assert.equal(app._assetScanToken,null);
    assert.equal(app.scanProgress,null);
    assert.deepEqual(app.scanResults,[]);
    finish([{path:"stale.png",ok:true}]);
    await pending;
    assert.deepEqual(app.scanResults,[],"a completed pre-clear scan must not repopulate cleared results");
  }finally{mediaCache.scanSet=originalScanSet;mediaCache.clear=originalClear;}
});
