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
