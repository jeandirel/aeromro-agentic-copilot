import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const code=readFileSync(new URL("../aircraft-gallery.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const vercel=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));

function boot() {
  const callbacks={}, elements={};
  const dialog={ addEventListener(type,fn){callbacks.dialogClick=fn;},showModal(){this.open=true;},close(){this.open=false;} };
  const filters=["all","Airbus","Boeing"].map(filter=>({
    dataset:{filter},attrs:{},setAttribute(k,v){this.attrs[k]=v;}
  }));
  const models={innerHTML:"",querySelectorAll:()=>[]};
  const count={textContent:""};
  const detail={innerHTML:""};
  const root={
    innerHTML:"",
    addEventListener(type,fn){callbacks[type]=fn;},
    querySelector(sel){
      return sel==="dialog"?dialog:sel==="#modelList"?models:sel==="#resultCount"?count:sel==="#dialogContent"?detail:null;
    },
    querySelectorAll(sel){return sel==="[data-filter]"?filters:[];}
  };
  let Component;
  const customElements={get(){return Component;},define(tag,classDef){assert.equal(tag,"aero-aircraft-gallery");Component=classDef;}};
  class HTMLElement {attachShadow(init){assert.equal(init.mode,"open");return root;}}
  vm.runInNewContext(code,{HTMLElement,customElements});
  const instance=new Component();
  instance.connectedCallback();
  const click=(kind,value)=>{
    callbacks.click({target:{closest:(selector)=>selector==="["+kind+"]"?{dataset:{[kind.slice(5)]:value}}:null}});
  };
  return {root,models,count,detail,filters,dialog,click};
}

test("Photo gallery is a real isolated native browser component",()=>{
  assert.match(code,/extends HTMLElement/);
  assert.match(code,/attachShadow\(\{mode:"open"\}\)/);
  assert.match(code,/showModal\(\)/);
  assert.match(code,/aria-pressed/);
  assert.match(code,/prefers-reduced-motion/);
  assert.match(html,/<aero-aircraft-gallery/);
  assert.match(html,/data-section="industry"/);
  assert.match(html,/data-view="industry"/);
});

test("Each aircraft family has a distinct validated-source photograph",()=>{
  const all=code.match(/Special:FilePath\//g)||[];
  assert.equal(all.length,8,"each of four aircraft needs thumbnail and modal image");
  const names=["Airbus_A320","Airbus_A350","Boeing_787","Boeing_777"];
  for(const name of names)assert.ok(code.includes(name),name);
  assert.ok(code.includes("commons.wikimedia.org/wiki/File:"));
  const rule=vercel.headers.flatMap(record=>record.headers).find(header=>header.key==="Content-Security-Policy");
  assert.match(rule.value,/img-src[^;]*https:\/\/commons.wikimedia.org/);
  assert.match(rule.value,/img-src[^;]*https:\/\/upload.wikimedia.org/);
  assert.match(code,/Aucune relation commerciale ou certification/);
  assert.ok(!/sensorRate|Math.random\(/.test(code),"no fictional data streams in showcase");
});

test("Airbus filter hides Boeing and updates the active segment",()=>{
  const h=boot();
  assert.equal(h.count.textContent,"4 familles d’appareils");
  assert.match(h.models.innerHTML,/Airbus A320/);
  assert.match(h.models.innerHTML,/Boeing 777-200/);
  h.click("data-filter","Airbus");
  assert.equal(h.count.textContent,"2 familles d’appareils");
  assert.match(h.models.innerHTML,/Airbus A350/);
  assert.doesNotMatch(h.models.innerHTML,/Boeing 787/);
  assert.equal(h.filters[1].attrs["aria-pressed"],"true");
});

test("Model details show credited documentary image and integration disclosure",()=>{
  const h=boot();
  h.click("data-model","A320");
  assert.equal(h.dialog.open,true);
  assert.match(h.detail.innerHTML,/Crédit photo/);
  assert.match(h.detail.innerHTML,/Aucun suivi d.appareil réel/);
  assert.match(h.detail.innerHTML,/commons.wikimedia.org/);
});
