// node tests/uuid-fallback.mock.mjs -- tests browser behavior without crypto.randomUUID.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomFillSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../api.js',import.meta.url),'utf8');
const game=readFileSync(new URL('../game.js',import.meta.url),'utf8');
assert.ok(!game.includes('crypto.randomUUID()'),'Game must use the shared safe UUID factory');
const cache=new Map();
const storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k)};
const document={
 getElementById:id=>id==='storageNotice'?{hidden:true,textContent:''}:null,
 head:{appendChild:node=>queueMicrotask(()=>node.onload?.())},
 createElement:tag=>({src:'',onload:null,onerror:null}),
 addEventListener(){},hidden:false
};
const nativeHttpCrypto={getRandomValues(a){return randomFillSync(a)}};
const fakeToday={date:'2026-10-22',revision:'fb3029da186b169c678ebe8b',day_number:3,available:false,questions:{},statistics:'disabled'};
const ctx={console,crypto:nativeHttpCrypto,document,window:{addEventListener(){}},navigator:{},localStorage:storage,Headers,AbortSignal,
  fetch:async()=>new Response(JSON.stringify(fakeToday),{headers:{'Content-Type':'application/json','ETag':'"a"'}}),
  setInterval(){},queueMicrotask,URLSearchParams,CLOSEISH_CONFIG:{apiBase:'https://closeish-production.up.railway.app'}};
ctx.globalThis=ctx;
vm.runInNewContext(source,ctx,{filename:'api.js'});
for(let n=0;n<20&&!ctx.CLOSEISHApi;n++)await new Promise(r=>setTimeout(r,0));
assert.ok(ctx.CLOSEISHApi,'API initializes without randomUUID');
const uuid=ctx.CLOSEISHApi.newUuidV4;
const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert.match(ctx.CLOSEISHApi.playerId,valid);
assert.equal(cache.get('closeish-player-v1'),ctx.CLOSEISHApi.playerId);
const uuids=Array.from({length:200},uuid);
assert.equal(new Set(uuids).size,200);
for(const id of uuids)assert.match(id,valid);
console.log(JSON.stringify({passed:true,httpCompatible:true,cryptographicFallback:true,uuidV4:true,sampleCount:200}));
