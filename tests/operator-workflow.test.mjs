import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");

function engine(subset,unit,rul,status) {
  return {subset,unit,rul,status,rul_low:Math.max(0,rul-2),rul_high:rul+6,cycles_flown:150+unit,confidence:.91};
}
function harness() {
  const elements=new Map();
  const listeners=new Map();
  const inputs={statusFilter:"all",sortSelect:"rul_asc"};
  let failFD002=false;
  let failHealth=false;
  const calls=[];
  const datasets={
    FD001:[engine("FD001",1,50,"healthy"),engine("FD001",2,3,"inspect_now")],
    FD002:[engine("FD002",7,2,"inspect_now")]
  };
  function element(id) {
    if(!elements.has(id)){
      const events={};
      elements.set(id,{
        id,innerHTML:"",textContent:"",value:inputs[id]||"",hidden:false,disabled:false,scrollHeight:0,
        classList:{toggle(){},remove(){},add(){}},
        addEventListener(type,handler){(events[type]??=[]).push(handler);},
        reportValidity(){return true;},
        requestSubmit(){(events.submit||[]).forEach(fn=>fn({preventDefault(){}}));}
      });
    }
    return elements.get(id);
  }
  const document={
    hidden:false,
    getElementById:element,
    querySelectorAll:()=>[],
    addEventListener(type,fn){(listeners.get(type)||listeners.set(type,[]).get(type)).push(fn);}
  };
  async function fetch(url,options={}){
    const path=new URL(String(url),"https://local.example").searchParams.get("path");
    calls.push({path,method:options.method||"GET",body:options.body});
    if(path==="/health" && failHealth)return {ok:false,status:503,json:async()=>({detail:"Service unavailable"})};
    if(path?.startsWith("/fleets/FD002") && failFD002)return {ok:false,status:503,json:async()=>({detail:"Fleet unavailable"})};
    let payload;
    if(path==="/health")payload={status:"ok",llm_provider:"bedrock"};
    else if(path==="/fleets")payload=[
      {subset:"FD001",engines:2,status_counts:{inspect_now:1,healthy:1,plan_inspection:0}},
      {subset:"FD002",engines:1,status_counts:{inspect_now:1,healthy:0,plan_inspection:0}}
    ];
    else if(/^\/fleets\/FD00[12]\/engines$/.test(path))payload={engines:datasets[path.split("/")[2]],thresholds:{}};
    else if(/^\/fleets\/FD00[12]\/engines\/\d+\?history=60$/.test(path)){
      const match=path.match(/^\/fleets\/(FD00[12])\/engines\/(\d+)/);
      const found=datasets[match[1]].find(e=>e.unit===Number(match[2]));
      payload={engine:found,history:[{cycle:1,rul:found.rul+5},{cycle:2,rul:found.rul}],sensors:{}};
    }else if(path==="/ask") {
      const ask=JSON.parse(options.body);
      const found=datasets[ask.subset].find(e=>e.unit===ask.unit);
      payload={answer:"Analyse fournie par le service distant",policy:{decision:"allow"},engine:found,usage:{model:"test-bedrock",latency_ms:8}};
    }else throw Error("Unexpected route: "+path);
    return {ok:true,status:200,json:async()=>payload};
  }
  const context=vm.createContext({document,window:{matchMedia:()=>({matches:true}),scrollTo(){}},fetch,
    AbortSignal,Number,Intl,URL,Blob,console,setInterval(){}});
  vm.runInContext(source,context,{filename:"app.js"});
  return {context,elements,element,listeners,calls,failFD002:()=>{failFD002=true;},failHealth:()=>{failHealth=true;}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));

test("Mission console ranks true RUL risk across fleets and focuses the riskiest current engine",async()=>{
  const h=harness();await tick();
  const queue=h.element("priorityRows").innerHTML;
  assert.ok(queue.includes("FD002 / ENG–7"),"Second fleet should appear in global triage");
  assert.ok(queue.indexOf("FD002 / ENG–7")<queue.indexOf("FD001 / ENG–1"),"Urgent motors must precede healthy motors");
  assert.equal(h.element("ribbonActive").textContent,"FD001 / ENG–2","Selected engine defaults to urgent, not first in list");
  assert.ok(h.element("commandFocus").innerHTML.includes("3"),"Focus shows backend RUL");
  assert.ok(h.element("ribbonSync").textContent.includes("2/2 flottes"));
});
test("Partial reload invalidates stale subset data and warns visibly",async()=>{
  const h=harness();await tick();
  h.failFD002();
  await vm.runInContext("init(true)",h.context);
  assert.ok(h.element("priorityRows").innerHTML.includes("Couverture partielle"));
  assert.ok(!h.element("priorityRows").innerHTML.includes("FD002 / ENG–7"),"Stale FD002 must not survive refresh");
  assert.ok(h.element("ribbonSync").textContent.includes("1/2 flottes"));
  assert.ok(h.element("globalError").textContent.includes("Couverture incomplète"));
});
test("Engine analysis controls submit a contextual /ask request; they never fabricate AI output",async()=>{
  const h=harness();await tick();
  const handler=h.listeners.get("click")[0];
  await handler({target:{closest:()=>({dataset:{copilotIntent:"risk"}})}});
  await tick();
  const request=h.calls.find(x=>x.path==="/ask");
  assert.ok(request,"Copilot must call AWS /ask");
  assert.equal(request.method,"POST");
  const body=JSON.parse(request.body);
  assert.equal(body.subset,"FD001");
  assert.equal(body.unit,2);
  assert.match(body.question,/RUL restant/);
  assert.ok(h.element("aiOutput").innerHTML.includes("Analyse fournie par le service distant"));
});

test("A lost AWS connection never masquerades as a zero-risk fleet",async()=>{
  const h=harness();await tick();
  h.failHealth();
  await vm.runInContext("init(true)",h.context);
  assert.equal(h.element("ribbonCritical").textContent,"—");
  assert.equal(h.element("ribbonActive").textContent,"Aucun moteur");
  assert.ok(!h.element("commandFocus").innerHTML.includes("RUL ESTIMÉ"));
  assert.ok(!h.element("priorityRows").innerHTML.includes("FD002 / ENG–7"));
  assert.ok(h.element("globalError").textContent.includes("Impossible de charger"));
});
