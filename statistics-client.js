/* Persistent completion outbox. First queued completion is retried before any replay. */
(()=>{'use strict';
 const Api=globalThis.CLOSEISHApi,BOOT=globalThis.CLOSEISH_BOOT,KEY='closeish-statistics-v1';
 let saved;
 try{saved=JSON.parse(localStorage.getItem(KEY))}catch{}
 if(!saved||!Array.isArray(saved.outbox)||!Array.isArray(saved.accepted))saved={outbox:[],accepted:[],errors:{}};
 saved.errors||={};
 const states=new Map();let flushing=false;
 const key=date=>Api.playerId+':'+date;
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{Api.storageWarning()}}
 function state(date){return {...states.get(date),pending:saved.outbox.some(x=>x.playerId===Api.playerId&&x.date===date),error:saved.errors[key(date)]||states.get(date)?.error}}
 function update(date,value){states.set(date,{...states.get(date),...value});window.dispatchEvent(new Event('closeish-statistics'))}
 async function refresh(date,revision){
  if(BOOT.statistics==='disabled'){update(date,{error:'Daily statistics are not configured on this server.'});return}
  if(states.get(date)?.loading)return;
  update(date,{loading:true});
  try{
   let {statistics}=await Api.post('/api/v1/statistics',{date,revision,playerId:Api.playerId});
   if(statistics.official&&statistics.official.revision!==statistics.revision)({statistics}=await Api.post('/api/v1/statistics',{date,revision:statistics.official.revision,playerId:Api.playerId}));
   if(statistics.official){const id=key(date);if(!saved.accepted.includes(id))saved.accepted.push(id);delete saved.errors[id];persist()}
   update(date,{data:statistics,error:null});
  }catch{update(date,{error:'Daily results are temporarily unavailable. Your game is saved on this device.'})}
  finally{update(date,{loading:false})}
 }
 async function flush(){
  if(flushing||BOOT.statistics==='disabled')return;flushing=true;
  try{
   while(saved.outbox.length){
    const item=saved.outbox[0],id=item.playerId+':'+item.date;
    try{
     const {statistics}=await Api.post('/api/v1/results',item);
     saved.outbox.shift();saved.accepted.push(id);saved.accepted=saved.accepted.slice(-730);delete saved.errors[id];persist();
     if(item.playerId===Api.playerId)update(item.date,{data:statistics,error:null});
    }catch(error){
     if(['RECEIPT_EXPIRED','INVALID_RESULT'].includes(error.code)){
      saved.outbox.shift();saved.errors[id]='This run could not be counted: its score receipts expired or are invalid. Your local result is kept.';persist();update(item.date,{});continue;
     }
     update(item.date,{error:'Your result is waiting to sync. It will retry when the connection is available.'});break;
    }
   }
  }finally{flushing=false}
 }
 function complete(progress){
  const id=key(progress.date),receipts=progress.responses?.map(x=>x?.receipt);
  if(BOOT.statistics!=='disabled'&&progress.completed&&receipts?.length===6&&receipts.every(x=>typeof x==='string')&&!saved.accepted.includes(id)&&!saved.errors[id]&&!saved.outbox.some(x=>x.date===progress.date&&x.playerId===Api.playerId)){
   saved.outbox.push({date:progress.date,revision:progress.revision,runId:progress.runId,playerId:Api.playerId,receipts});persist();update(progress.date,{});
  }
  flush().finally(()=>refresh(progress.date,progress.revision));
 }
 globalThis.CLOSEISHStats={state,complete,refresh};
 window.addEventListener('online',()=>{flush();if(BOOT.available)refresh(BOOT.date,BOOT.revision)});
 setInterval(()=>{if(!document.hidden&&saved.outbox.length)flush()},30000);
 flush();
})();
