import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, SETTINGS } from "../scripts/constants.js";

test("module registers settings and exposes its API during a Foundry-like init/ready cycle", async () => {
  const once = new Map();
  const on = new Map();
  globalThis.Hooks = {
    once(name, callback) { once.set(name, callback); },
    on(name, callback) { const rows = on.get(name) ?? []; rows.push(callback); on.set(name, rows); return callback; },
    call(name, ...args) { let allowed = true; for (const callback of on.get(name) ?? []) if (callback(...args) === false) allowed = false; return allowed; },
    callAll(name, ...args) { for (const callback of on.get(name) ?? []) callback(...args); }
  };

  let applicationRenderCount = 0;
  class ApplicationV2 {
    constructor(options = {}) { this.options = options; this.rendered = false; }
    render() { this.rendered = true; applicationRenderCount += 1; return this; }
    close() { this.rendered = false; }
    async _onRender() {}
  }
  const HandlebarsApplicationMixin = Base => class extends Base {};
  class MockToken { get isVisible() { return true; } }
  globalThis.foundry = {
    applications: { api: { ApplicationV2, HandlebarsApplicationMixin, DialogV2: {} } },
    canvas: { placeables: { Token: MockToken } },
    utils: {
      deepClone: value => structuredClone(value),
      mergeObject: (base, patch) => ({ ...base, ...patch }),
      randomID: length => "x".repeat(length)
    }
  };

  const settings = new Map();
  const registrations = new Map();
  const menus = new Map();
  const keybindings = new Map();
  const gm = { id: "gm", name: "GM", isGM: true, active: true, async setFlag() {} };
  const users = [gm];
  users.get = id => users.find(user => user.id === id);
  const actors = [];
  actors.get = () => null;
  const module = { id: MODULE_ID, active: true };
  globalThis.game = {
    user: gm,
    users,
    actors,
    scenes: [],
    playlists: new Map(),
    modules: new Map([[MODULE_ID, module], ["lib-wrapper", { active: false }]]),
    system: { id: "forbidden-lands", version: "13.0.5" },
    i18n: { localize: key => key, format: (key, data = {}) => `${key}:${JSON.stringify(data)}` },
    settings: {
      register(scope, key, config) { registrations.set(`${scope}.${key}`, config); if (!settings.has(key)) settings.set(key, structuredClone(config.default)); },
      registerMenu(scope, key, config) { menus.set(`${scope}.${key}`, config); },
      get(_scope, key) { return settings.get(key); },
      async set(_scope, key, value) { settings.set(key, value); return value; }
    },
    keybindings: { register(scope, key, config) { keybindings.set(`${scope}.${key}`, config); } }
  };
  globalThis.canvas = { scene: null, tokens: { placeables: [], controlled: [], get: () => null }, grid: {} };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.CONST = { KEYBINDING_PRECEDENCE: { NORMAL: 0 } };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  globalThis.window = globalThis;

  await import(`../scripts/main.js?smoke=${Date.now()}`);
  assert.ok(once.has("init"));
  assert.ok(once.has("ready"));

  await once.get("init")();
  assert.ok(registrations.has(`${MODULE_ID}.${SETTINGS.STATE}`));
  assert.ok(menus.has(`${MODULE_ID}.manager`));
  assert.ok(keybindings.has(`${MODULE_ID}.emergencyMute`));

  await once.get("ready")();
  assert.equal(game.modules.get(MODULE_ID).api.version, "1.0.12");
  assert.equal(game.otherworldlyVisions, game.modules.get(MODULE_ID).api);
  assert.equal(typeof game.otherworldlyVisions.openManager, "function");

  const managerToolName = `${MODULE_ID}-manager`;
  const controls = {
    tokens: { name: "tokens", tools: { [managerToolName]: { name: managerToolName }, select: { name: "select" } } },
    notes: { name: "notes", tools: { select: { name: "select" } } }
  };
  for (const callback of on.get("getSceneControlButtons") ?? []) callback(controls);
  assert.equal(controls.tokens.tools[managerToolName], undefined, "manager tool must be removed from Token Controls");
  assert.equal(controls.notes.tools[managerToolName]?.name, managerToolName, "manager tool must be added to Journal Notes");
  assert.equal(controls.notes.tools[managerToolName]?.button, true, "manager Scene Control entry must be a button");

  const legacyControls = [
    { name: "token", tools: [{ name: managerToolName }] },
    { name: "notes", tools: [{ name: "select" }] }
  ];
  for (const callback of on.get("getSceneControlButtons") ?? []) callback(legacyControls);
  assert.equal(legacyControls[0].tools.some(tool => tool.name === managerToolName), false, "legacy Token Controls must be cleaned");
  assert.equal(legacyControls[1].tools.filter(tool => tool.name === managerToolName).length, 1, "legacy Journal Notes receives one manager tool");

  const actor = {
    id: "actor-1",
    name: "Touched Test",
    type: "character",
    documentName: "Actor",
    getFlag() { return undefined; },
    async setFlag() {}
  };
  const v2Sheet = new ApplicationV2();
  v2Sheet.actor = actor;
  const legacyButtons = [];
  for (const callback of on.get("getActorSheetHeaderButtons") ?? []) callback(v2Sheet, legacyButtons);
  assert.equal(legacyButtons.length, 0, "ApplicationV2 sheets must not receive inert V1 onclick buttons");

  const headerChildren = [];
  const header = {
    querySelectorAll() { return headerChildren.filter(child => child.className?.includes(`${MODULE_ID}-actor`)); },
    querySelector(selector) {
      if (selector === "[data-ov-actor-button='true']") return headerChildren.find(child => child.dataset?.ovActorButton === "true") ?? null;
      return null;
    },
    appendChild(child) { headerChildren.push(child); child.parentNode = this; }
  };
  const root = {
    matches() { return false; },
    closest() { return null; },
    querySelector(selector) { return selector === ".window-header" ? header : null; }
  };
  globalThis.document.createElement = () => ({
    dataset: {},
    className: "",
    attributes: new Map(),
    listeners: new Map(),
    setAttribute(key, value) { this.attributes.set(key, value); },
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    remove() {},
    click() { return this.listeners.get("click")?.({ preventDefault() {}, stopPropagation() {} }); }
  });
  const beforeActorEditor = applicationRenderCount;
  for (const callback of on.get("renderActorSheetV2") ?? []) callback(v2Sheet, root);
  assert.equal(headerChildren.length, 1, "ApplicationV2 sheet receives one direct Touched button");
  headerChildren[0].click();
  assert.equal(applicationRenderCount, beforeActorEditor + 1, "Touched button opens the actor editor");

  const { scheduler } = await import("../scripts/visions/scheduler.js");
  const { visibilityService } = await import("../scripts/visibility/visibility-service.js");
  scheduler.stopAll();
  visibilityService.destroy();
});
