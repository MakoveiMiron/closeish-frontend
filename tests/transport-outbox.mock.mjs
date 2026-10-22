// node tests/transport-outbox.mock.mjs -- runs without npm install or a browser.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';

const files=['api.js','statistics-client.js'];
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const store=new Map();
const localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
const notices=[];
const document={
 hidden:false,
 getElementById:id=>id==='storageNotice'?{hidden:true,textContent:'',replaceChildren(){},append(){}}:
                    id==='app'?{replaceChildren(){},append(){}}:id==='loadStatus'?{textContent:''}:null,
 createElement:tag=>({tagName:tag,src:'',onload:null,onerror:null,append(){},className:'',textContent:''}),
 head:{appendChild:script=>queueMicrotask(()=>script.onload?.())},
 addEventListener:(name,fn)=>notices.push([name,fn])
};
const window={addEventListener:()=>{},dispatchEvent:()=>{}};
let reqs=[];
const revision='fb3029da186b169c678ebe8b';
const BOOT={date:'2026-10-22',revision,day_number:3,available:true,questions:{},published_dates:[],statistics:'postgres'};
function makeResponse(data,status=200,extra={}){
 return new Response(status===304?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...extra}});
}
const fetch=async (url,opts)=>{
 reqs.push({url,opts});
 if(url.endsWith('/today'))return makeResponse(BOOT,200,{'ETag':'"revision-1"'});
 if(url.includes('/progress?'))return makeResponse({date:BOOT.date,progress:null,days:[],month:'2026-10',counted:false});
 if(url.includes('/hints?'))return makeResponse({candidates:[]});
 if(url.endsWith('/answer'))return makeResponse({result:{points:200,receipt:'signed'}});
 if(url.endsWith('/statistics'))return makeResponse({statistics:{total:0,histogram:[]}});
 if(url.endsWith('/results'))return makeResponse({error:{code:'RATE_LIMIT',message:'Wait'}},429,{'Retry-After':'15'});
 throw new Error('Unexpected URL '+url);
};
const global={
 console,document,window,navigator:{},localStorage,crypto,Headers,URLSearchParams,AbortSignal,fetch,
 setInterval:()=>{},setTimeout,clearTimeout,queueMicrotask,
 CLOSEISH_CONFIG:{apiBase:'https://closeish-production.up.railway.app',apiKey:'public-browser-key'}
};
global.globalThis=global;
vm.runInNewContext(read('api.js'),global,{filename:'api.js'});
for(let tries=0;tries<20&&!global.CLOSEISHApi;tries++)await new Promise(r=>setTimeout(r,0));
assert.ok(global.CLOSEISHApi);
assert.match(global.CLOSEISHApi.playerId,/^[0-9a-f-]{36}$/i);
const cached=await global.CLOSEISHApi.getToday();
assert.equal(cached.revision,revision);
assert.ok(reqs.some(r=>r.url.endsWith('/today')&&r.opts.cache==='no-cache'));
assert.equal(store.has('closeish-today-cache-v1'),false);
assert.ok(reqs.some(r=>r.url.includes('/progress?')));
await global.CLOSEISHApi.question('a-b','hints',{q:'abc'});
await global.CLOSEISHApi.question('a-b','answer',{raw:'example',kind:'answer',runId:crypto.randomUUID()});
const sent=reqs.find(r=>r.url.endsWith('/answer'));
assert.equal(sent.opts.headers.get('X-API-Key'),'public-browser-key');
assert.equal(sent.opts.headers.get('Content-Type'),'application/json');
assert.equal(sent.opts.credentials,'omit');
assert.equal(JSON.parse(sent.opts.body).playerId,global.CLOSEISHApi.playerId);
let error;
try{await global.CLOSEISHApi.post('/api/v1/results',{a:1})}catch(e){error=e}
assert.equal(error?.code,'RATE_LIMIT');
assert.equal(error.retryAfterSeconds,15);

let submissions=0;
const statsRequests=[];
const official={score:600,revision,runId:'00000000-0000-4000-8000-000000000001',completedAt:'2026-10-22T09:00:00Z'};
const statData={date:'2026-10-22',revision,histogram:[{score:600,count:1}],total:1,mean:600,mode:'postgres',official};
const stubPost=async(path,body)=>{
 if(path.endsWith('/results')){
  submissions++;
  if(submissions===1)throw Object.assign(new Error('service unavailable'),{status:503,code:'STATS_UNAVAILABLE'});
  assert.equal(body.receipts.length,6);
  assert.ok(!('score' in body));
  return {statistics:statData};
 }
 statsRequests.push({path,body});return {statistics:statData};
};
function startStats(){
 const ctx={console,localStorage,window,document,Event:class{constructor(type){this.type=type}},
   Date,setInterval:()=>{},CLOSEISH_BOOT:BOOT,
   CLOSEISHApi:{post:stubPost,playerId:global.CLOSEISHApi.playerId,storageWarning(){}}};
 ctx.globalThis=ctx;
 vm.runInNewContext(read('statistics-client.js'),ctx,{filename:'statistics-client.js'});
 return ctx;
}
const progress={date:BOOT.date,revision,runId:official.runId,completed:true,
 responses:Array.from({length:6},(_,i)=>({receipt:'signed-'+i,points:100}))};
let stats=startStats();
stats.CLOSEISHStats.complete(progress);
await new Promise(r=>setTimeout(r,10));
let saved=JSON.parse(store.get('closeish-statistics-v1'));
assert.equal(submissions,1);
assert.equal(saved.outbox.length,1);
assert.deepEqual([...saved.outbox[0].receipts],progress.responses.map(r=>r.receipt));
assert.ok(saved.outbox[0].retryAt>Date.now());
// Simulate a later page load after the durable retry deadline.
saved.outbox[0].retryAt=0;store.set('closeish-statistics-v1',JSON.stringify(saved));
stats=startStats();
await new Promise(r=>setTimeout(r,15));
saved=store.get('closeish-statistics-v1');
assert.equal(submissions,2);
assert.equal(saved,undefined,'No synchronized results are duplicated in localStorage');
assert.equal(stats.CLOSEISHStats.state(BOOT.date).data.total,1);
// An old unsigned V16 progress may be displayed locally, but never becomes an official result.
stats.CLOSEISHStats.complete({...progress,date:'2026-10-21',revision:'legacy',migrated:true,runId:null,
 responses:Array.from({length:6},()=>({points:1200}))});
await new Promise(r=>setTimeout(r,5));
assert.equal(submissions,2);
console.log(JSON.stringify({passed:true,browserHttpCache:true,conditionalApiKey:true,jsonPost:true,rateLimitRetryAfter:true,
  signedOutboxSurvivesReload:true,transient503Retried:true,legacyUnsignedRejected:true},null,2));
