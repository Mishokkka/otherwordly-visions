import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
function walk(dir){return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path];});}
function flatten(object,prefix="",out=new Set()){for(const [key,value] of Object.entries(object)){const path=prefix?`${prefix}.${key}`:key;if(value&&typeof value==="object"&&!Array.isArray(value))flatten(value,path,out);else out.add(path);}return out;}

const manifest=JSON.parse(readFileSync(join(root,"module.json"),"utf8"));
const packageJson=JSON.parse(readFileSync(join(root,"package.json"),"utf8"));
const constantsSource=readFileSync(join(root,"scripts/constants.js"),"utf8");
assert.equal(manifest.id,"otherworldly-visions");
assert.equal(manifest.version,"1.0.7");
assert.equal(packageJson.version,manifest.version,"package.json version must match module.json");
assert.equal(constantsSource.match(/MODULE_VERSION\s*=\s*["']([^"']+)["']/)?.[1],manifest.version,"API version must match module.json");
for(const path of [...manifest.esmodules,...manifest.styles,...manifest.languages.map(row=>row.path)])assert.ok(statSync(join(root,path)).isFile(),`Missing manifest path: ${path}`);

const js=walk(join(root,"scripts")).filter(path=>path.endsWith(".js"));
for(const path of js)execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
for(const path of js){const source=readFileSync(path,"utf8");for(const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)){const imported=normalize(resolve(dirname(path),match[1]));assert.ok(statSync(imported).isFile(),`Missing import ${match[1]} in ${relative(root,path)}`);}}

const allSource=[...js,...walk(join(root,"templates")).filter(path=>path.endsWith(".hbs"))].map(path=>readFileSync(path,"utf8")).join("\n");
const usedKeys=new Set([...allSource.matchAll(/OV\.[A-Za-z0-9_.]+/g)].map(match=>match[0]).filter(key=>key!=="OV.Tab."));
for(const key of ["OV.Tab.Director","OV.Tab.Sets","OV.Tab.Actors","OV.Tab.Tokens","OV.Tab.Diagnostics"])usedKeys.add(key);
for(const lang of ["en","ru"]){const keys=flatten(JSON.parse(readFileSync(join(root,`lang/${lang}.json`),"utf8")));const missing=[...usedKeys].filter(key=>!keys.has(key));assert.deepEqual(missing,[],`${lang} missing localization keys`);}

const templates=walk(join(root,"templates")).filter(path=>path.endsWith(".hbs"));
const actions=new Set(templates.flatMap(path=>[...readFileSync(path,"utf8").matchAll(/data-action=["']([^"']+)["']/g)].map(match=>match[1])));
const scriptText=js.map(path=>readFileSync(path,"utf8")).join("\n");
for(const action of actions)assert.match(scriptText,new RegExp(`(?:\\b${action}\\s*:|static\\s+(?:async\\s+)?${action}\\s*\\()`),`Unregistered ApplicationV2 action: ${action}`);

for(const path of templates){const source=readFileSync(path,"utf8"),stack=[];for(const match of source.matchAll(/{{([#/]?)(if|unless|each)\b[^}]*}}/g)){const [,kind,name]=match;if(kind==="#")stack.push(name);else if(kind==="/")assert.equal(stack.pop(),name,`Unbalanced block in ${relative(root,path)}`);}assert.equal(stack.length,0,`Unclosed block in ${relative(root,path)}`);}

function countTopLevelElements(source){
  const voidElements=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
  const clean=source.replace(/{{![\s\S]*?}}/g,"").replace(/{{[\s\S]*?}}/g,"").replace(/<!--[\s\S]*?-->/g,"");
  const stack=[];let roots=0;
  for(const match of clean.matchAll(/<\s*(\/)?\s*([A-Za-z][\w:-]*)[^>]*?>/g)){
    const closing=Boolean(match[1]),name=match[2].toLowerCase(),token=match[0];
    if(closing){assert.equal(stack.pop(),name,`Mismatched HTML closing tag </${name}>`);continue;}
    if(stack.length===0)roots++;
    if(!voidElements.has(name)&&!token.endsWith("/>"))stack.push(name);
  }
  assert.equal(stack.length,0,"Unclosed HTML element in template");
  return roots;
}
for(const path of templates){
  const source=readFileSync(path,"utf8");
  assert.equal(countTopLevelElements(source),1,`ApplicationV2 template part must render exactly one root element: ${relative(root,path)}`);
}

const actorTemplate=readFileSync(join(root,"templates/actor-editor.hbs"),"utf8");
assert.match(actorTemplate,/ov-actor-topbar/,"Touched actor editor must use the module toolbar language");
assert.match(actorTemplate,/ov-card ov-actor-card/,"Touched actor editor must use manager-style cards");
assert.match(actorTemplate,/ov-kpi-grid ov-actor-kpis/,"Touched actor editor must use manager-style KPI cards");
assert.match(scriptText,/applyWindowChrome\(this\)/,"ApplicationV2 windows must apply module chrome");

const css=walk(join(root,"styles")).filter(path=>path.endsWith(".css"));
for(const path of css){const source=readFileSync(path,"utf8").replace(/\/\*[\s\S]*?\*\//g,"");for(const chunk of source.split("}")){const selector=chunk.split("{")[0]?.trim();if(!selector||selector.startsWith("@")||selector.includes("from")||selector.includes("to")||/^\d+%/.test(selector))continue;for(const part of selector.split(",").map(value=>value.trim()))assert.ok(part.startsWith(".otherworldly-visions")||part.startsWith(".application.otherworldly-visions")||part.startsWith("#ov-flash-layer")||part.startsWith(".control-icon.ov-")||part.startsWith("#combat-tracker")||part.startsWith(".combat-tracker"),`Unscoped CSS selector in ${relative(root,path)}: ${part}`);}}

assert.doesNotMatch(scriptText,/game\.socket\.(emit|on)/,"Raw module socket transport must not be used");
assert.doesNotMatch(scriptText,/token\.visible\s*=/,"Token.visible assignment is forbidden");
assert.ok(scriptText.includes("DIRECT_FALLBACK")&&scriptText.includes("libWrapper.register"),"Visibility fallback contract missing");
console.log(`Static checks passed: ${js.length} JS, ${templates.length} templates, ${css.length} styles, ${usedKeys.size} localization keys.`);
