/* CLOSEISH V17.3: static-browser transport. No private backend secrets belong here. */
(()=>{'use strict';
const cfg=globalThis.CLOSEISH_CONFIG||{};
const base=String(cfg.apiBase||'').replace(/\/+$/,'');
const apiKey=typeof cfg.apiKey==='string'?cfg.apiKey:'';
const TODAY_CACHE='closeish-today-cache-v1';
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
 notice.textContent='Browser storage is unavailable. Progress may be lost when this tab closes.';
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
   ...options,headers,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)
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
function readCachedToday(){
 try{
  const cached=JSON.parse(localStorage.getItem(TODAY_CACHE));
  return cached&&cached.data&&typeof cached.data.date==='string'&&typeof cached.etag==='string'?cached:null;
 }catch{return null}
}
async function getToday(){
 const cached=readCachedToday();
 const headers=cached?{'If-None-Match':cached.etag}:{};
 let result=await transport('/api/v1/today',{headers});
 // A 304 is useful only with a locally preserved exact copy.
 if(result.status===304){
  if(cached)return cached.data;
  result=await transport('/api/v1/today');
 }
 if(!result.data||typeof result.data.date!=='string'||typeof result.data.revision!=='string'){
  throw new Error('Invalid daily challenge response');
 }
 const etag=result.headers.get('ETag');
 if(etag){
  try{localStorage.setItem(TODAY_CACHE,JSON.stringify({etag,data:result.data}))}catch{storageWarning()}
 }else{
  try{localStorage.removeItem(TODAY_CACHE)}catch{}
 }
 return result.data;
}
function question(id,action,fields={}){
 if(!['hints','answer','catalogue'].includes(action))throw new Error('Unsupported question API action');
 const data={date:boot.date,revision:boot.revision,...fields,...(action==='answer'?{playerId}:{})};
 const path='/api/v1/questions/'+encodeURIComponent(id)+'/'+action;
 return action==='answer'?post(path,data):request(path+'?'+new URLSearchParams(data));
}
function loadScript(src){return new Promise((resolve,reject)=>{
 const script=document.createElement('script');script.src=src+'?v=17.3';script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
})}
async function start(){
 if(started)return;
 started=true;
 try{
  boot=await getToday();globalThis.CLOSEISH_BOOT=boot;
  try{localStorage.setItem('closeish-storage-check','1');localStorage.removeItem('closeish-storage-check')}catch{storageWarning()}
  globalThis.CLOSEISHApi={question,storageWarning,post,playerId,getToday,newUuidV4};
  for(const file of ['/view-core.js','/community.js','/score-chart.js','/statistics-client.js','/game.js'])await loadScript(file);
  let checking=false;
  async function checkDate(){
   if(document.hidden||checking)return;
   checking=true;
   try{
    const latest=await getToday();
    if(latest.date!==boot.date||latest.revision!==boot.revision||latest.available!==boot.available){
     const notice=document.getElementById('storageNotice');notice.hidden=false;
     notice.replaceChildren(document.createTextNode('The daily challenge has changed. Your previous progress is saved. '));
     const button=document.createElement('button');button.textContent='LOAD TODAY';button.onclick=()=>location.reload();notice.append(button);
    }
   }catch{}finally{checking=false}
  }
  setInterval(checkDate,60000);document.addEventListener('visibilitychange',checkDate);
 }catch(error){
  console.error('[CLOSEISH] Unable to start:',error);
  started=false;
  const app=document.getElementById('app');app.replaceChildren();
  const panel=document.createElement('main');panel.className='start-screen';
  const heading=document.createElement('h2');heading.textContent='CLOSEISH';
  const p=document.createElement('p');
  p.textContent=error?.status===401?'API authentication is not configured correctly.':
   error?.status===403?'This website is not authorized by the game server.':
   'Today’s challenge could not be loaded. Check your connection and try again.';
  const retry=document.createElement('button');retry.className='cta';retry.textContent='TRY AGAIN';retry.onclick=()=>location.reload();
  panel.append(heading,p,retry);app.append(panel);
 }
}
// Keep two tabs from writing the same anonymous run concurrently.
if(navigator.locks){
 navigator.locks.request('closeish-game-writer',{ifAvailable:true},async lock=>{
  if(!lock){const el=document.getElementById('loadStatus');if(el)el.textContent='CLOSEISH is open in another tab. Close that tab, then reload.';return}
  await start();await new Promise(resolve=>window.addEventListener('pagehide',resolve,{once:true}));
 });
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
}else{start()}
})();
