/* Small transport/bootstrap layer. The browser never contains the answer banks. */
(()=>{'use strict';
const base=(globalThis.CLOSEISH_CONFIG?.apiBase||'').replace(/\/$/,'');
let boot,started=false;
let playerId;
try{playerId=localStorage.getItem('closeish-player-v1')}catch{}
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerId||'')){
 playerId=crypto.randomUUID();try{localStorage.setItem('closeish-player-v1',playerId)}catch{}
}
const post=(path,data)=>request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function storageWarning(){
 const notice=document.getElementById('storageNotice');
 notice.hidden=false;notice.textContent='Browser storage is unavailable. Progress cannot be kept after this tab closes.';
}
async function request(path,options={}){
 const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(12000)});
 const data=await response.json();
 if(!response.ok){const error=new Error(data.error?.message||'Request failed');error.code=data.error?.code;throw error}
 return data;
}
async function question(id,action,fields){
 const data={date:boot.date,revision:boot.revision,...fields,...(action==='answer'?{playerId}:{})};
 const path='/api/v1/questions/'+encodeURIComponent(id)+'/'+action;
 return action==='answer'?request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}):request(path+'?'+new URLSearchParams(data));
}
function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src+'?v=17';script.onload=resolve;script.onerror=reject;document.head.appendChild(script)})}
async function start(){
 if(started)return;started=true;
 try{
  boot=await request('/api/v1/today');globalThis.CLOSEISH_BOOT=boot;
  try{localStorage.setItem('closeish-storage-check','1');localStorage.removeItem('closeish-storage-check')}catch{storageWarning()}
  globalThis.CLOSEISHApi={question,storageWarning,post,playerId};
  for(const file of ['/view-core.js','/community.js','/score-chart.js','/statistics-client.js','/game.js'])await loadScript(file);
  let checking=false;
  async function checkDate(){
   if(document.hidden||checking)return;checking=true;
   try{const latest=await request('/api/v1/today');
    if(latest.date!==boot.date||latest.revision!==boot.revision){
     const notice=document.getElementById('storageNotice');notice.hidden=false;
     notice.replaceChildren(document.createTextNode('A new daily game is available. Your progress has been saved. '));
     const button=document.createElement('button');button.textContent='LOAD TODAY';button.onclick=()=>location.reload();notice.append(button);
    }
   }catch{}finally{checking=false}
  }
  setInterval(checkDate,60000);document.addEventListener('visibilitychange',checkDate);
 }catch{
  started=false;const app=document.getElementById('app');app.replaceChildren();
  const panel=document.createElement('main');panel.className='start-screen';
  const heading=document.createElement('h2');heading.textContent='CLOSEISH';
  const text=document.createElement('p');text.textContent='Today’s challenge could not be loaded. Check your connection and try again.';
  const retry=document.createElement('button');retry.className='cta';retry.textContent='TRY AGAIN';retry.onclick=()=>location.reload();
  panel.append(heading,text,retry);app.append(panel);
 }
}
// One writer per browser profile prevents two game tabs from overwriting a run.
if(navigator.locks){
 navigator.locks.request('closeish-game-writer',{ifAvailable:true},async lock=>{
  if(!lock){const el=document.getElementById('loadStatus');el.textContent='CLOSEISH is open in another tab. Close that tab, then reload this one.';return}
  await start();await new Promise(resolve=>window.addEventListener('pagehide',resolve,{once:true}));
 });
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
}else{start()}
})();
