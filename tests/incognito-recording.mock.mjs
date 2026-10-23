import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
const source=readFileSync(new URL('../statistics-client.js',import.meta.url),'utf8');
const revision='abcdefabcdefabcdefabcdef',date='2026-10-23';
const done=playerId=>({date,revision,runId:randomUUID(),completed:true,
 responses:Array.from({length:6},(_,i)=>({receipt:'signed-'+i,points:200}))});
const delay=()=>new Promise(resolve=>setTimeout(resolve,5));
function run({officialFirst=false,privateStorage=false}={}){
 const playerId=randomUUID(),store=new Map(),calls=[],notices=[];
 const own={score:1200,revision,runId:randomUUID()};
 const stats=official=>({statistics:{date,revision,total:official?1:0,histogram:[],
   official:official?own:null}});
 const post=async(path,body)=>{
  calls.push({path,body});
  if(path==='/api/v1/statistics')return stats(officialFirst);
  if(path==='/api/v1/results')return stats(true);
  throw new Error('Unexpected: '+path);
 };
 const storage=privateStorage?{
  getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')}
 }:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
 const window={dispatchEvent:()=>{},addEventListener:()=>{}};
 const document={hidden:false,addEventListener:()=>{}};
 const ctx={console,window,document,localStorage:storage,Event:class{constructor(type){this.type=type}},
  setInterval:()=>{},CLOSEISH_BOOT:{date,revision,statistics:'postgres'},CLOSEISH_REMOTE_PROGRESS:{counted:false},
  CLOSEISHApi:{playerId,post,storageWarning(){notices.push('warning')}}};
 ctx.globalThis=ctx;
 vm.runInNewContext(source,ctx,{filename:'statistics-client.js'});
 return {ctx,store,calls,notices,playerId};
}
test('counted backend reply: opening results fetches stats once, no duplicate result write',async()=>{
 const env=run({officialFirst:true});
 await env.ctx.CLOSEISHStats.verifyCompletion(done(env.playerId));
 assert.equal(env.calls.filter(x=>x.path.endsWith('/statistics')).length,1);
 assert.equal(env.calls.filter(x=>x.path.endsWith('/results')).length,0);
 assert.ok(env.ctx.CLOSEISHStats.state(date).data.official);
});
test('incognito completion with missing official score immediately repairs via signed POST',async()=>{
 const env=run({officialFirst:false});
 await env.ctx.CLOSEISHStats.verifyCompletion(done(env.playerId));
 await delay();
 assert.equal(env.calls.filter(x=>x.path.endsWith('/statistics')).length,1);
 const submissions=env.calls.filter(x=>x.path.endsWith('/results'));
 assert.equal(submissions.length,1);assert.equal(submissions[0].body.receipts.length,6);
 assert.equal(submissions[0].body.playerId,env.playerId);
 assert.ok(env.ctx.CLOSEISHStats.state(date).data.official);
 assert.equal(env.store.has('closeish-statistics-v1'),false);
});
test('private session with browser storage disabled can still submit a completed result in-memory',async()=>{
 const env=run({privateStorage:true});
 env.ctx.CLOSEISHStats.complete(done(env.playerId));
 await delay();
 assert.equal(env.calls.filter(x=>x.path.endsWith('/results')).length,1);
 assert.ok(env.ctx.CLOSEISHStats.state(date).data.official);
 assert.ok(env.notices.length>0);
});
