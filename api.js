/* CLOSEISH V17.4: static-browser transport. No private backend secrets belong here. */
(()=>{'use strict';
const cfg=globalThis.CLOSEISH_CONFIG||{};
const base=String(cfg.apiBase||'').replace(/\/+$/,'');
const apiKey=typeof cfg.apiKey==='string'?cfg.apiKey:'';
const TODAY_CACHE='closeish-today-cache-v1'; // legacy cache removed below
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// randomUUID() needs HTTPS in many browsers. getRandomValues() also works over HTTP.
// Do not downgrade to Math.random(): both playerId and runId must be UUID v4.
function newUuidV4(){
 const browserCrypto=globalThis.crypto;
 if(typeof browserCrypto?.randomUUID==='function')return browserCrypto.randomUUID();
 if(typeof browserCrypto?.getRandomValues!=='function')throw new Error('Secure random number generation is unavailable in this browser.');
 const bytes=new Uint8Array(16);
 browserCrypto.getRandomValues(bytes);
 bytes[6]=(bytes[6]&0x0f)|0x40; // version 4
 bytes[8]=(bytes[8]&0x3f)|0x80; // RFC 4122 variant
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
let boot,started=false,playerId;
try{playerId=localStorage.getItem('closeish-player-v1')}catch{}
if(!UUID_V4.test(playerId||'')){
 playerId=newUuidV4();
 try{localStorage.setItem('closeish-player-v1',playerId)}catch{}
}
function storageWarning(){
 const notice=document.getElementById('storageNotice');
 if(!notice)return;
 notice.hidden=false;
 notice.textContent='Browser storage is unavailable. Keep this window open until your final score is confirmed by the server.';
}
function parseRetryAfter(header){
 if(!header)return 0;
 const seconds=Number(header);
 if(Number.isFinite(seconds))return Math.max(0,Math.ceil(seconds));
 const date=Date.parse(header);
 return Number.isFinite(date)?Math.max(0,Math.ceil((date-Date.now())/1000)):0;
}
async function transport(path,{headers:extraHeaders={},...options}={}){
 if(!path.startsWith('/api/'))throw new Error('Only /api/ paths are supported');
 const headers=new Headers(extraHeaders);
 if(apiKey)headers.set('X-API-Key',apiKey);
 let response;
 try{
  response=await fetch(base+path,{
   ...options,headers,credentials:'omit',cache:options.method==='POST'?'no-store':'no-cache',signal:AbortSignal.timeout(12000)
  });
 }catch(err){
  const error=new Error(err?.name==='TimeoutError'?'API request timed out.':'Unable to reach the API.');
  error.code=err?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR';
  error.status=0;
  throw error;
 }
 const data=response.status===304?null:await response.json().catch(()=>null);
 if(!response.ok&&response.status!==304){
  const error=new Error(data?.error?.message||`API error (${response.status})`);
  error.status=response.status;
  error.code=data?.error?.code||`HTTP_${response.status}`;
  error.retryAfterSeconds=parseRetryAfter(response.headers.get('Retry-After'));
  if(response.status===401||response.status===403||response.status===413||response.status===415){
   console.error('[CLOSEISH] Backend configuration/request error:',response.status,error.code,error.message);
  }
  throw error;
 }
 return {status:response.status,data,headers:response.headers};
}
async function request(path,options){
 const {data}=await transport(path,options);
 if(data===null)throw new Error('Missing JSON API response');
 return data;
}
function post(path,data){return request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})}
async function getToday(){
 const data=await request('/api/v1/today');
 if(!data||typeof data.date!=='string'||typeof data.revision!=='string'&&data.available)throw new Error('Invalid daily challenge response');
 // The browser HTTP cache, governed by the backend ETag, handles validation.
 // The daily question payload is NOT duplicated into localStorage.
 try{localStorage.removeItem(TODAY_CACHE)}catch{}
 return data;
}
async function getProgress(month,day){
 const params=new URLSearchParams({playerId});if(month)params.set('month',month);if(day)params.set('day',day);
 return request('/api/v1/progress?'+params);
}
function question(id,action,fields={}){
 if(!['hints','answer','catalogue'].includes(action))throw new Error('Unsupported question API action');
 const data={...fields,date:boot.date,revision:boot.revision,...(action==='answer'?{playerId}:{})};
 const path='/api/v1/questions/'+encodeURIComponent(id)+'/'+action;
 return action==='answer'?post(path,data):request(path+'?'+new URLSearchParams(data));
}
function loadScript(src){return new Promise((resolve,reject)=>{
 const script=document.createElement('script');script.async=false;script.src=src+'?v=18.1.0';script.onload=resolve;script.onerror=()=>reject(new Error('Could not load the game assets.'));document.head.appendChild(script);
})}
// Paint the landing page from index.html before fetching ANY game-specific data.
// Until game.js hydrates it, clicks are queued rather than lost; the clock only
// starts once the first actual question is visible.
let gameReady=false,pendingIntent=null;
const appRoot=document.getElementById('app');
function setBootStatus(message,isError=false){
 const status=document.getElementById('bootStatus');if(!status)return;
 status.textContent=message;status.classList.toggle('boot-error',isError);
}
appRoot?.addEventListener?.('click',event=>{
 if(gameReady)return;
 const button=event.target?.closest?.('button');if(!button||button.disabled)return;
 if(button.id==='startBtn'){
  pendingIntent={type:'play'};button.disabled=true;setBootStatus('Preparing your challenge. The first question will open when it is ready…');
 }else if(button.dataset.modal&&['rules','archive','suggest'].includes(button.dataset.modal)){
  pendingIntent={type:'modal',name:button.dataset.modal};
  setBootStatus('Opening '+button.textContent.trim()+' as soon as the game finishes loading…');
 }
});
function showStartupError(error){
 console.error('[CLOSEISH] Unable to start:',error);
 const status=error?.status;
 const notFound=status===404||error?.code==='INVALID_DAY';
 const message=notFound?'That challenge does not exist or has not been published.':
  status===401||status===403?'The game service is temporarily unavailable. Please try again later.':
  status===429?'Too many requests right now. Please try again shortly.':
  status>=500?'The game server is having trouble. Your confirmed progress remains on the server.':
  'We could not load the challenge. Check your connection and try again.';
 const restoring=document.documentElement.classList.contains('closeish-restore-wait');
 if(restoring){
  const splash=document.getElementById('restoreSplash');
  if(splash){
   splash.classList.add('restore-error');
   splash.querySelector('.restore-kicker').textContent='UNABLE TO RESTORE';
   splash.querySelector('h2').textContent='CONNECTION ISSUE.';
   splash.querySelector('.restore-copy').textContent=message;
   const actions=splash.querySelector('.restore-actions');
   actions.replaceChildren();
   const retry=document.createElement('button');retry.className='cta';retry.textContent='TRY AGAIN';
   retry.addEventListener('click',()=>location.reload());actions.append(retry);
   if(notFound){const home=document.createElement('a');home.className='cta ghost';home.href='/';home.textContent='BACK TO HOME ↗';actions.append(home)}
   return;
  }
 }
 const button=document.getElementById('startBtn');if(button)button.hidden=true;
 setBootStatus(message,true);
 const area=appRoot?.querySelector?.('.launch-copy');if(!area)return;
 const actions=document.createElement('div');actions.className='startup-actions';
 const retry=document.createElement('button');retry.className='cta';retry.textContent='TRY AGAIN';
 retry.addEventListener('click',()=>location.reload());actions.append(retry);
 if(notFound){const home=document.createElement('a');home.className='cta ghost';home.href='/';home.textContent='BACK TO HOME ↗';actions.append(home)}
 area.append(actions);
}
async function start(){
 if(started)return;
 started=true;
 try{
  const requested=new URLSearchParams(globalThis.location?.search||'').get('day');
  if(requested&&!/^\d{4}-\d{2}-\d{2}$/.test(requested))throw Object.assign(new Error('Invalid day selection'),{status:404,code:'INVALID_DAY'});
  if(requested&&requested<'2026-10-23'){location.replace(location.pathname);return}
  // These three scripts have no day/progress dependency. Download them at the
  // same time as BOTH API requests instead of delaying all assets until later.
  globalThis.CLOSEISHApi={question,storageWarning,post,playerId,getToday,getProgress,newUuidV4};
  const assets=Promise.all(['/view-core.js','/community.js','/score-chart.js'].map(loadScript));
  const [today,remote]=await Promise.all([
   requested?request('/api/v1/days/'+requested):getToday(),
   getProgress(requested?.slice(0,7),requested),assets
  ]);
  boot=today;globalThis.CLOSEISH_BOOT=boot;globalThis.CLOSEISH_REMOTE_PROGRESS=remote;
  try{localStorage.setItem('closeish-storage-check','1');localStorage.removeItem('closeish-storage-check')}catch{storageWarning()}
  // These depend on the verified server state, which MUST not be guessed from
  // the static landing page or localStorage.
  await loadScript('/statistics-client.js');
  await loadScript('/game.js');
  gameReady=true;
  if(pendingIntent?.type==='play')document.getElementById('startBtn')?.click();
  else if(pendingIntent?.type==='modal'){
   const name=pendingIntent.name;
   appRoot?.querySelector?.('[data-modal="'+name+'"]')?.click();
  }
  pendingIntent=null;
  let checking=false;
  async function checkDate(){
   if(document.hidden||checking)return;
   checking=true;
   try{
    const latest=await getToday();
    if((boot.date===boot.current_date)&&(latest.date!==boot.current_date||latest.revision!==boot.revision||latest.available!==boot.available)){
     const notice=document.getElementById('storageNotice');notice.hidden=false;
     notice.replaceChildren(document.createTextNode('The daily challenge has changed. Your previous progress is saved. '));
     const button=document.createElement('button');button.textContent='LOAD TODAY';button.onclick=()=>location.assign(location.pathname);notice.append(button);
    }
   }catch{}finally{checking=false}
  }
  setInterval(checkDate,300000);document.addEventListener('visibilitychange',checkDate);
 }catch(error){started=false;showStartupError(error)}
}
// Keep two tabs from writing the same anonymous run concurrently.
if(navigator.locks){
 navigator.locks.request('closeish-game-writer',{ifAvailable:true},async lock=>{
  if(!lock){setBootStatus('CLOSEISH is open in another tab. Close that tab, then reload.',true);const play=document.getElementById('startBtn');if(play)play.disabled=true;return}
  await start();await new Promise(resolve=>window.addEventListener('pagehide',resolve,{once:true}));
 });
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
}else{start()}
})();
