/* Persistent signed-results outbox. The server alone decides the official score. */
(()=>{'use strict';
 const Api=globalThis.CLOSEISHApi,BOOT=globalThis.CLOSEISH_BOOT,KEY='closeish-statistics-v1';
 const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 let saved;
 try{saved=JSON.parse(localStorage.getItem(KEY))}catch{}
 if(!saved||!Array.isArray(saved.outbox)||!Array.isArray(saved.accepted))saved={outbox:[],accepted:[],errors:{}};
 saved.errors||={};
 // A body is not created from a legacy unsigned progress entry.
 saved.outbox=saved.outbox.filter(item=>item&&UUID_V4.test(item.playerId||'')&&UUID_V4.test(item.runId||'')&&Array.isArray(item.receipts)&&item.receipts.length===6&&item.receipts.every(r=>typeof r==='string'&&r.length>0));
 const states=new Map(),statsRetryAt=new Map();let flushing=false;
 const key=date=>Api.playerId+':'+date;
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{Api.storageWarning()}}
 function state(date){return {...states.get(date),pending:saved.outbox.some(x=>x.playerId===Api.playerId&&x.date===date),error:saved.errors[key(date)]||states.get(date)?.error}}
 function update(date,value){states.set(date,{...states.get(date),...value});window.dispatchEvent(new Event('closeish-statistics'))}
 function backoff(error){return Math.max(30000,Number(error?.retryAfterSeconds||0)*1000)}
 async function refresh(date,revision){
  if(BOOT.statistics==='disabled'){update(date,{loading:false,error:'Daily statistics are not enabled on this server.'});return}
  if(states.get(date)?.loading||Date.now()<(statsRetryAt.get(date)||0))return;
  update(date,{loading:true});
  try{
   let {statistics}=await Api.post('/api/v1/statistics',{date,revision,playerId:Api.playerId});
   if(statistics?.official?.revision&&statistics.official.revision!==revision){
    ({statistics}=await Api.post('/api/v1/statistics',{date,revision:statistics.official.revision,playerId:Api.playerId}));
   }
   if(!statistics||!Array.isArray(statistics.histogram))throw new Error('Invalid statistics response');
   statsRetryAt.delete(date);
   if(statistics.official){
    const id=key(date);if(!saved.accepted.includes(id))saved.accepted.push(id);
    saved.accepted=saved.accepted.slice(-730);delete saved.errors[id];persist();
   }
   update(date,{data:statistics,error:null});
  }catch(error){
   if(error.status===429||error.status===503||!error.status){statsRetryAt.set(date,Date.now()+backoff(error))}
   update(date,{error:error.status===429?'Daily statistics are rate-limited. Retrying later.':
    'Daily results are temporarily unavailable. Your game remains saved on this device.'});
  }finally{update(date,{loading:false})}
 }
 async function flush(){
  if(flushing||BOOT.statistics==='disabled'||!saved.outbox.length)return;
  flushing=true;
  try{
   // Backoff is persisted so refreshes/reloads don't hammer the Railway API.
   for(let i=0;i<saved.outbox.length;){
    const item=saved.outbox[i],id=item.playerId+':'+item.date;
    if(Date.now()<(item.retryAt||0)){i++;continue}
    const body={date:item.date,revision:item.revision,playerId:item.playerId,runId:item.runId,receipts:item.receipts};
    try{
     const {statistics}=await Api.post('/api/v1/results',body);
     saved.outbox.splice(i,1);
     if(!saved.accepted.includes(id))saved.accepted.push(id);
     saved.accepted=saved.accepted.slice(-730);delete saved.errors[id];persist();
     if(item.playerId===Api.playerId){
      update(item.date,{data:statistics,error:null});
      // A post succeeded: fetch current statistics now rather than waiting for the next 30s refresh.
      statsRetryAt.delete(item.date);refresh(item.date,item.revision);
     }
    }catch(error){
     if(error.status===400){
      saved.outbox.splice(i,1);
      saved.errors[id]='This signed result could not be counted ('+(error.code||'INVALID_RESULT')+'). Your local answers are kept.';
      persist();update(item.date,{});continue;
     }
     item.retryAt=Date.now()+backoff(error);
     persist();
     if(item.playerId===Api.playerId){
      update(item.date,{error:error.status===429?'Submission rate-limited. Your result will retry after the server-specified delay.':
       'Your result is saved locally and waiting to sync.'});
     }
     // Stop on server outage, network failure, rate limits, and authentication/CORS errors.
     // The body is retained verbatim; never presume success or failure on an ambiguous response.
     if(error.status===429||!error.status||error.status>=500||error.status===401||error.status===403)break;
     i++;
    }
   }
  }finally{flushing=false}
 }
 function complete(progress){
  const id=key(progress.date),receipts=progress.responses?.map(r=>r?.receipt);
  const valid=progress.completed&&!progress.migrated&&UUID_V4.test(progress.runId||'')&&
   /^[0-9a-f]{24}$/i.test(progress.revision||'')&&receipts?.length===6&&
   receipts.every(r=>typeof r==='string'&&r.length>0);
  if(BOOT.statistics!=='disabled'&&valid&&!saved.accepted.includes(id)&&!saved.errors[id]&&
     !saved.outbox.some(x=>x.date===progress.date&&x.playerId===Api.playerId)){
   saved.outbox.push({date:progress.date,revision:progress.revision,runId:progress.runId,playerId:Api.playerId,receipts});
   persist();update(progress.date,{});
  }
  flush().finally(()=>refresh(progress.date,progress.revision));
 }
 globalThis.CLOSEISHStats={state,complete,refresh,flush};
 window.addEventListener('online',()=>{flush();if(BOOT.available)refresh(BOOT.date,BOOT.revision)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){flush();if(BOOT.available&&states.get(BOOT.date)?.data)refresh(BOOT.date,BOOT.revision)}});
 setInterval(()=>{if(!document.hidden&&saved.outbox.length)flush()},30000);
 persist();flush();
})();
