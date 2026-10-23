/* CLOSEISH: decide the initial paint before the body is parsed.
 * A visual hint only. The server remains authoritative for every game state.
 */
(()=>{'use strict';
 const KEY='closeish-first-screen-v1', VIEW_KEY='closeish-restore-view-v1';
 const root=document.documentElement;
 function budapestDate(){
  try{
   const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'
   }).formatToParts(new Date());
   const value=Object.fromEntries(parts.map(p=>[p.type,p.value]));
   return `${value.year}-${value.month}-${value.day}`;
  }catch{return new Date().toISOString().slice(0,10)}
 }
 let params;
 try{params=new URLSearchParams(location.search).get('day')}catch{}
 const date=/^\d{4}-\d{2}-\d{2}$/.test(params||'')?params:budapestDate();
 function read(){
  try{const value=JSON.parse(localStorage.getItem(KEY));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
  catch{return {}}
 }
 const history=read();
 function readViews(){try{const value=JSON.parse(localStorage.getItem(VIEW_KEY));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
 const views=readViews();
 let returning=false,unfinished=false;
 try{
  returning=Boolean(localStorage.getItem('closeish-player-v1'));
  const pending=JSON.parse(localStorage.getItem('closeish-pending-v1')||'null');
  unfinished=pending?.date===date&&(
   Number.isInteger(pending.activeRound)||Boolean(pending.pendingSubmission)||pending.phase==='play');
 }catch{}
 // Known untouched day: show instant intro. Unknown returning players: verify
 // with PostgreSQL first (also covers completions from older frontend versions).
 if(history[date]==='game'||unfinished||(history[date]!=='intro'&&returning)){
  root.classList.add('closeish-restore-wait');
  root.classList.add(unfinished||views[date]==='round'?'closeish-restore-round':'closeish-restore-results');
 }
 function remember(day,played){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return;
  try{
   const entries=read();
   entries[day]=played?'game':'intro';
   const dates=Object.keys(entries).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
   for(const old of dates.slice(0,Math.max(0,dates.length-90)))delete entries[old];
   localStorage.setItem(KEY,JSON.stringify(entries));
  }catch{/* Private browsing may block persistent storage. */}
 }
 function rememberView(day,view){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return;
  try{const entries=readViews();if(view==='results'||view==='round')entries[day]=view;else delete entries[day];
   const dates=Object.keys(entries).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
   for(const old of dates.slice(0,Math.max(0,dates.length-90)))delete entries[old];
   localStorage.setItem(VIEW_KEY,JSON.stringify(entries));
  }catch{/* The server is authoritative, including in private browsing. */}
 }
 function settle(){root.classList.remove('closeish-restore-wait','closeish-restore-round','closeish-restore-results')}
 globalThis.CLOSEISHStartup={remember,rememberView,settle};
})();
