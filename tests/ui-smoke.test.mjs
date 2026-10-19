import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/proxy.js";

function mockResponse() {
  return {
    code: 200, headers: {}, payload: undefined,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(text) { this.payload = JSON.parse(text); return this; },
  };
}
function mockRequest(method, path, body) {
  return { method, query:{path}, body };
}
test("Health proxy calls only the fixed AWS origin and forwards the JSON response", async () => {
  const prev = globalThis.fetch;
  let called;
  globalThis.fetch = async (target, options) => {
    called = { url:String(target), options };
    return {ok:true, status:200, text:async()=>JSON.stringify({status:"ok",subsets:["FD001"]})};
  };
  try {
    const res = mockResponse();
    await handler(mockRequest("GET","/health"),res);
    assert.equal(res.code,200);
    assert.equal(res.payload.status,"ok");
    assert.match(called.url,/^https:\/\/[^/]+\/health$/);
    assert.equal(called.options.method,"GET");
    assert.equal(called.options.body,undefined);
    assert.equal(res.headers["Cache-Control"],"no-store, max-age=0");
  } finally { globalThis.fetch=prev; }
});
test("Proxy rejects disallowed endpoints before any upstream request", async()=>{
  const prev=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error("upstream must not be called");};
  try {
    for(const path of ["/mcp","/admin","/audit/secret","https://other.example/health","//evil.example/health"]){
      const res=mockResponse();
      await handler(mockRequest("GET",path),res);
      assert.ok(res.code===403||res.code===400,JSON.stringify({path,status:res.code}));
    }
  } finally {globalThis.fetch=prev;}
});
test("The /ask route forwards only valid engine questions; invalid bodies are blocked",async()=>{
  const prev=globalThis.fetch;
  let last;
  globalThis.fetch=async(target,opts)=>{
    last={target:String(target),opts};
    return {status:200,text:async()=>JSON.stringify({answer:"RUL prédictif",policy:{decision:"require_approval"}})};
  };
  try {
    let res=mockResponse();
    await handler(mockRequest("POST","/ask",{subset:"FD001",unit:81,question:"Quel est le RUL ?"}),res);
    assert.equal(res.code,200);
    assert.equal(res.payload.policy.decision,"require_approval");
    assert.deepEqual(JSON.parse(last.opts.body),{subset:"FD001",unit:81,question:"Quel est le RUL ?"});
    assert.match(last.target,/\/ask$/);
    for (const invalid of [{subset:"FD005",unit:81,question:"RUL ?"},{subset:"FD001",unit:0,question:"RUL ?"},{subset:"FD001",unit:81,question:"x"}]){
      res=mockResponse();
      await handler(mockRequest("POST","/ask",invalid),res);
      assert.equal(res.code,400);
    }
  } finally {globalThis.fetch=prev;}
});

test("Gateway denies cross-site POST, oversized payloads and malformed upstream query values", async () => {
  const oldFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return {status:200,text:async()=>JSON.stringify([])}; };
  try {
    const badPaths = [
      "/audit?limit=0", "/audit?limit=201", "/audit?limit=10&limit=15",
      "/fleets/FD001/engines/2?history=401",
      "/fleets/FD001/engines?status=not_a_status",
      "/health?limit=1", "/ask?unexpected=1",
      "/health#unexpected"
    ];
    for (const path of badPaths) {
      const res = mockResponse();
      await handler(mockRequest("GET",path),res);
      assert.ok(res.code === 400 || res.code === 403, JSON.stringify({path,status:res.code}));
    }
    const crossSite = {...mockRequest("POST","/ask",{subset:"FD001",unit:1,question:"Explain RUL"}),headers:{"host":"aeromro.example","origin":"https://evil.example"}};
    let res = mockResponse();
    await handler(crossSite,res);
    assert.equal(res.code,403);
    res = mockResponse();
    await handler({...mockRequest("GET","/health"),headers:{"sec-fetch-site":"cross-site"}},res);
    assert.equal(res.code,403);
    res = mockResponse();
    await handler({...mockRequest("POST","/ask",{subset:"FD001",unit:1,question:"Explain RUL"}),headers:{"content-length":"3000"}},res);
    assert.equal(res.code,413);
    assert.equal(requests,0);
  } finally { globalThis.fetch = oldFetch; }
});
test("Gateway preserves supported filter and history query parameters", async () => {
  const oldFetch = globalThis.fetch;
  let captured = [];
  globalThis.fetch = async (url) => {
    captured.push(String(url));
    return {status:200,headers:{get:()=>null},text:async()=>JSON.stringify({engines:[]})};
  };
  try {
    for(const path of [
      "/fleets/FD001/engines?status=healthy",
      "/fleets/FD002/engines/1?history=100",
      "/audit?limit=50"
    ]){
      const res=mockResponse();
      await handler(mockRequest("GET",path),res);
      assert.equal(res.code,200);
    }
    assert.ok(captured[0].endsWith("/fleets/FD001/engines?status=healthy"));
    assert.ok(captured[1].endsWith("/fleets/FD002/engines/1?history=100"));
    assert.ok(captured[2].endsWith("/audit?limit=50"));
  } finally { globalThis.fetch=oldFetch; }
});
