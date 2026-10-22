(()=>{'use strict';
const Core=globalThis.CLOSEISHCore;
const Api=globalThis.CLOSEISHApi, Stats=globalThis.CLOSEISHStats, BOOT=globalThis.CLOSEISH_BOOT;
const DATA=BOOT.available?{[BOOT.day_number]:BOOT.questions}:{}, TODAY=BOOT.date, MAX=7200, STORAGE='closeish-progress-v2', REVIEW='closeish-review-v2';
let cityLookupPending=false; // One submission in flight; retained name for UI compatibility.
const CATEGORIES={history:'HISTORY',geography:'GEOGRAPHY',music:'MUSIC',culture:'CULTURE & HERITAGE',science:'SCIENCE',technology:'TECH & GAMES',sports:'SPORTS',literature:'LITERATURE',biology:'BIOLOGY',economics:'ECONOMICS',environment:'ENVIRONMENT',astronomy:'ASTRONOMY',society:'SOCIETY',education:'EDUCATION',language:'LANGUAGE & WORDPLAY',design:'ART & DESIGN',transport:'TRANSPORT',demography:'DEMOGRAPHY',housing:'HOUSING',wildlife:'WILDLIFE','cinema':'CINEMA','maritime-history':'MARITIME HISTORY','motorsport':'MOTORSPORT','travel':'TRAVEL','timekeeping':'TIMEKEEPING','videogames':'VIDEO GAMES','natural-wonders':'NATURAL WONDERS','civic-life':'CIVIC LIFE','music-technology':'MUSIC TECHNOLOGY','international-money':'CURRENCIES','river-history':'RIVER HISTORY','protected-places':'NATIONAL PARKS','jobs-economy':'LABOUR MARKET','solar-science':'SOLAR SCIENCE','published-books':'BOOKS','human-development':'HUMAN DEVELOPMENT','infrastructure':'BRIDGES'};
const TIERS=[{points:1200,name:'PERFECT HIT',short:'1200'},{points:1000,name:'RAZOR EDGE',short:'1000'},{points:800,name:'CLOSE CALL',short:'800'},{points:600,name:'SOLID HIT',short:'600'},{points:400,name:'IN THE ZONE',short:'400'},{points:200,name:'ON THE BOARD',short:'200'}];
const norm=Core.norm;

const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const formatNum=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:6});

// Unit preference is presentation-only. Core.score always receives original source values.
const UNIT_PREF_KEY='closeish-units-pref-v1';
let unitPreference='metric';
const UNIT_DATA={
 'kg':{us:{factor:2.2046226218487757,label:'lb',decimals:2}},
 'g':{us:{factor:0.03527396195,label:'oz',decimals:2}},
 'km':{us:{factor:0.621371192237334,label:'mi',decimals:2}},
 'm':{us:{factor:3.280839895,label:'ft',decimals:2}},
 'cm':{us:{factor:0.3937007874,label:'in',decimals:2}},
 'mm':{us:{factor:0.03937007874,label:'in',decimals:2}},
 'km²':{us:{factor:0.3861021585424458,label:'sq mi',decimals:2}},
 'm²':{us:{factor:10.7639104167,label:'sq ft',decimals:2}},
 'hectares':{us:{factor:2.471053814671653,label:'acres',decimals:2}},
 'miles':{metric:{factor:1.609344,label:'km',decimals:2}},
 'feet':{metric:{factor:0.3048,label:'m',decimals:2}},
 'inches':{metric:{factor:2.54,label:'cm',decimals:2}},
 'pounds':{metric:{factor:0.45359237,label:'kg',decimals:2}},
 'lb':{metric:{factor:0.45359237,label:'kg',decimals:2}},
 'litres':{us:{factor:0.2641720523581484,label:'US gal',decimals:2}},
 'liters':{us:{factor:0.2641720523581484,label:'US gal',decimals:2}},
 'L':{us:{factor:0.2641720523581484,label:'US gal',decimals:2}},
 'mL':{us:{factor:0.0338140227,label:'US fl oz',decimals:2}},
 'gallons':{metric:{factor:3.785411784,label:'L',decimals:2}},
 'US gallons':{metric:{factor:3.785411784,label:'L',decimals:2}},
 'US gal':{metric:{factor:3.785411784,label:'L',decimals:2}}
};
function effectiveUnit(q){return UNIT_DATA[q.unit]?.[unitPreference]||{factor:1,label:q.unit||'',decimals:6}}
function visibleNumber(q,n){const spec=effectiveUnit(q);const converted=Number(n)*spec.factor;return Math.round((converted+Number.EPSILON)*10**spec.decimals)/10**spec.decimals}
function unitLabel(q){return effectiveUnit(q).label}
function displayMeasure(q,n){if(q.unit==='year'||/\byear\b/i.test(q.unit||''))return String(Math.round(Number(n)));return formatNum(visibleNumber(q,n))}
function displayDistance(q,n){return formatNum(visibleNumber(q,n))}
function displayPrompt(q){ return q.prompt; }
function unitControlHTML(){return ''}
function bindUnitControl(){}

const formatScore=n=>String(Math.round(Number(n)||0));
const stored=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const localDate=()=>BOOT.date;
const canPlayDay=n=>BOOT.available && n===BOOT.day_number;
let allProgress=stored(STORAGE,{});if(!allProgress||typeof allProgress!=='object'||Array.isArray(allProgress))allProgress={};
const ORIGINAL='closeish-first-completed-v1';let originalRuns=stored(ORIGINAL,{});if(!originalRuns||typeof originalRuns!=='object'||Array.isArray(originalRuns))originalRuns={};
let reviewQueue=stored(REVIEW,[]);if(!Array.isArray(reviewQueue))reviewQueue=[];
let dayNum=BOOT.day_number||Core.dayNumber(BOOT.date);
const availableDays=BOOT.published_dates;
// One-time migration from V15, only when it exists on this same browser origin.
if(!Object.keys(allProgress).length){
 const legacy=stored('closeish-20261020-clean-progress',{});
 for(const [key,value] of Object.entries(legacy||{})){
  const n=Number(key.split('@')[0]);if(!Number.isInteger(n)||n<1||n>7)continue;
  const date=new Date(Date.parse('2026-10-20T00:00:00Z')+(n-1)*86400000).toISOString().slice(0,10);
  if(!value||!Array.isArray(value.responses))continue;
  allProgress[date]={...value,date,revision:date===BOOT.date?BOOT.revision:'legacy',migrated:true};
 }
}
// Keep a completed historical revision rather than silently erase it on content updates.
if(allProgress[BOOT.date]?.revision && allProgress[BOOT.date].revision!==BOOT.revision && BOOT.available){
 allProgress[BOOT.date+'@'+allProgress[BOOT.date].revision]=allProgress[BOOT.date];delete allProgress[BOOT.date];
}
let archiveMonthIndex=0;
let phase='intro',round=0,startedAt=null,deadline=null,feedback=null,showModal=null,warning='',inputValue='',activeHints=[],confirmedMatch=null,timerHandle=null,lastInputAt=null,lastInputDraft='';
const brandCss=`
/* CLOSEISH identity + archive calendar only. Underlying design system unchanged. */
.logo{font-size:clamp(19px,2.2vw,28px);letter-spacing:-.055em;white-space:nowrap}
.hero h1{font-size:clamp(62px,12vw,148px);letter-spacing:-.08em;white-space:nowrap}
.hero-copy{min-width:0}
.closeish-calendar{width:100%;color:var(--ink)}
.cal-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:6px 0 18px}
.cal-heading{text-align:center;font:900 21px/1.18 var(--display-readable)}
.cal-heading small{display:block;margin-top:5px;font:700 10px var(--mono);letter-spacing:1px}
.cal-nav{width:43px;height:39px;flex-shrink:0;border:2px solid var(--ink);border-radius:10px;background:var(--paper);color:var(--ink);font:900 27px/1 var(--body);cursor:pointer}
.cal-nav:disabled{opacity:.28;cursor:default}
.cal-weekdays,.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.cal-weekdays{margin-bottom:7px}
.cal-weekdays span{text-align:center;font:900 10px var(--mono);color:var(--ink)}
.cal-grid{margin:0 0 17px}
.cal-empty{min-height:57px}
.cal-out-of-range{display:flex;align-items:flex-start;justify-content:flex-start;padding:8px;min-height:57px;color:#aaa3ae;background:#f1ebee;border:1px solid #e3dce3;border-radius:9px;font:800 13px var(--body)}
.cal-day{position:relative;min-height:57px;min-width:0;text-align:left;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;padding:7px;border:2px solid var(--ink);border-radius:9px;box-shadow:2px 2px 0 var(--ink);font:900 16px/1.1 var(--body);color:var(--ink);cursor:pointer;background:var(--paper)}
.cal-date{font-weight:900}
.cal-day small{font:800 9px var(--mono)}
.cal-day.cal-selected{background:var(--lemon)}
.cal-day.cal-completed{background:var(--pink)}
.cal-day.cal-upcoming{background:#eae5ec;color:#817a86;border-color:#cfc6d0;box-shadow:none;cursor:default;opacity:.75}
.cal-day.cal-available:not(:disabled):hover{background:var(--cyan);transform:translate(-1px,-1px)}
.cal-day:focus-visible,.cal-nav:focus-visible{outline:3px solid var(--blue);outline-offset:3px}
.cal-check{position:absolute;right:5px;top:4px;font-size:12px}
.cal-legend{display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;margin-bottom:6px}
.cal-legend span{display:flex;gap:5px;align-items:center;font:800 9px var(--mono)}
.cal-indicator{width:11px;height:11px;border:1.5px solid var(--ink);display:inline-block;background:var(--paper)}
.cal-indicator.done{background:var(--pink)}.cal-indicator.locked{background:#eae5ec;border-color:#cfc6d0}
@media(max-width:620px){.logo{font-size:clamp(18px,4.2vw,23px)}.hero h1{font-size:clamp(47px,12vw,77px);letter-spacing:-.085em}.hero-inner{padding-top:21px}.cal-day,.cal-empty,.cal-out-of-range{min-height:51px}.cal-day{padding:5px;font-size:14px}.cal-day small{font-size:8px}.cal-weekdays,.cal-grid{gap:4px}.cal-heading{font-size:19px}}
@media(max-width:355px){.logo{font-size:17px}.hero h1{font-size:42px}.cal-day{font-size:12px}}
`;const brandStyle=document.createElement('style');brandStyle.id='closeish-ui';brandStyle.textContent=brandCss;document.head.appendChild(brandStyle);
const el=document.getElementById('app');
const dayPack=()=>DATA[String(dayNum)];const questions=()=>Core.questions(dayPack());const currentQ=()=>questions()[round];const progressKey=()=>BOOT.date;
const curProgress=()=>allProgress[progressKey()]||{date:BOOT.date,revision:BOOT.revision,runId:Api.newUuidV4(),responses:[],completed:false};
function saveProgress(){
 const current=allProgress[progressKey()];
 if(current){current.runId||=Api.newUuidV4();current.responses||=[];current.date=BOOT.date;current.revision=BOOT.revision;current.updatedAt=Date.now();current.status=current.completed?'completed':(Number.isInteger(current.activeRound)||current.responses.length?'in_progress':'not_started');}
 try{localStorage.setItem(STORAGE,JSON.stringify(allProgress))}catch{Api.storageWarning()}
}
function recordResponse(result){const saved=curProgress();saved.responses[round]=result;saved.activeRound=null;saved.activeDeadline=null;saved.activeDraft=null;saved.activeInputAt=null;saved.pendingSubmission=null;saved.phase='reveal';saved.lastRound=round;saved.completed=saved.responses.filter(Boolean).length===6;if(saved.completed){saved.finishedAt=Date.now();if(!originalRuns[saved.date]){originalRuns[saved.date]=structuredClone(saved);try{localStorage.setItem(ORIGINAL,JSON.stringify(originalRuns))}catch{Api.storageWarning()}}}allProgress[progressKey()]=saved;saveProgress();if(saved.completed)Stats.complete(saved)}
function scoreSoFar(){return curProgress().responses.filter(Boolean).reduce((s,x)=>s+(x.points||0),0)}
function roundTimeLimit(){return Number(currentQ()?.time_limit_seconds)||30}
// Browser-local countdown. No tick endpoint, WebSocket or server push.
// Persisted wall-clock deadline survives reloads and background-tab timer throttling.
function timerRemaining(){return deadline?Math.max(0,Math.ceil((deadline-Date.now())/1000)):roundTimeLimit()}
function stopClock(){if(timerHandle){clearInterval(timerHandle);timerHandle=null}}
function startClock(){stopClock();timerHandle=setInterval(()=>{if(phase!=='play')return;const t=timerRemaining();const clock=document.getElementById('clock');if(clock){clock.textContent=String(t).padStart(2,'0')+'s';clock.classList.toggle('low',t<=7)}if(t<=0){timeoutRound();}},120)}
function playRound(){phase='play';confirmedMatch=null;feedback=null;warning='';inputValue='';lastInputAt=null;lastInputDraft='';deadline=Date.now()+roundTimeLimit()*1000;const saved=curProgress();saved.activeRound=round;saved.activeDeadline=deadline;saved.activeDraft='';saved.activeInputAt=null;saved.phase='play';allProgress[progressKey()]=saved;saveProgress();render();startClock();document.getElementById('guess')?.focus()}
function finalize(obj){if(phase!=='play')return;stopClock();phase='reveal';deadline=null;feedback=obj;recordResponse(obj);render();requestAnimationFrame(()=>document.getElementById('gameArea')?.scrollIntoView({behavior:'instant',block:'start'}))}

// Persist a draft with its real input timestamp. Only text present before the deadline can auto-lock.
function saveDraft(){
 const s=curProgress();s.activeDraft=inputValue;s.activeInputAt=lastInputAt;
 allProgress[progressKey()]=s;saveProgress();
}
function restoreDraft(s){
 confirmedMatch=null;inputValue=typeof s.activeDraft==='string'?s.activeDraft:'';
 lastInputDraft=inputValue;
 lastInputAt=Number.isFinite(s.activeInputAt)?s.activeInputAt:null;
}
// Same resolution rule for Enter, Submit, and the last-second automatic lock.

// All identity lookup and scoring use the backend's frozen daily data.
let hintSequence=0,hintTimeout=null,staleDay=false;const hintCache=new Map();
function candidateMatches(){return []}
function singleBestCandidate(matches){
 const [a,b]=matches;if(!a)return null;
 return b&&a.match===b.match&&a.dist===b.dist?null:a;
}
function chooseCandidate(c){
 const field=document.getElementById('guess');if(!field||!c)return;
 if(timerRemaining()<=0){timeoutRound();return}
 confirmedMatch=c;field.value=c.ent.canonical;inputValue=field.value;
 lastInputAt=Date.now();lastInputDraft=inputValue;saveDraft();activeHints=[];refreshInlineHint();field.focus();
}
function refreshInlineHint(){
 const ghost=document.getElementById('guessGhost'),field=document.getElementById('guess'),status=document.getElementById('resolvedHint'),submit=document.getElementById('submitGuess');
 if(!ghost||!field)return;
 if(confirmedMatch){ghost.textContent='';if(status){status.textContent='✓ '+confirmedMatch.ent.canonical+' confirmed · Enter again to submit';status.style.display='block'}if(submit)submit.textContent='SUBMIT ↗';return}
 if(status)status.style.display='none';
 const best=singleBestCandidate(activeHints),raw=field.value;
 if(!best||!raw.trim()){ghost.textContent='';if(submit)submit.textContent='CONFIRM ↵';return}
 const proposed=best.ent.canonical,tail=proposed.toLowerCase().startsWith(raw.toLowerCase())?proposed.slice(raw.length):' → '+proposed;
 ghost.innerHTML='<span class="ghost-typed"></span><span class="ghost-tail"></span><span class="ghost-instruction"> — Enter to confirm</span>';
 ghost.querySelector('.ghost-typed').textContent=raw;ghost.querySelector('.ghost-tail').textContent=tail;
}
async function requestHints(raw,seq){
 try{
  const cacheKey=currentQ().id+':'+raw.trim().toLocaleLowerCase();
  let found=hintCache.get(cacheKey);
  if(!found){found=await Api.question(currentQ().id,'hints',{q:raw});hintCache.set(cacheKey,found);if(hintCache.size>150)hintCache.delete(hintCache.keys().next().value)}
  if(seq!==hintSequence||phase!=='play'||inputValue!==raw||confirmedMatch)return;
  activeHints=found.candidates;refreshInlineHint();
 }catch{if(seq===hintSequence){activeHints=[];refreshInlineHint()}}
}
function updateHints(){
 if(cityLookupPending)return;
 const field=document.getElementById('guess');if(!field)return;
 confirmedMatch=null;inputValue=field.value;lastInputAt=Date.now();lastInputDraft=inputValue;saveDraft();
 if(deadline&&lastInputAt>=deadline){timeoutRound();return}
 activeHints=[];refreshInlineHint();clearTimeout(hintTimeout);const seq=++hintSequence;
 if(inputValue.trim())hintTimeout=setTimeout(()=>requestHints(inputValue,seq),250);
}
async function sendAnswer(raw,automatic=false,kind='answer'){
 if(cityLookupPending||phase!=='play'||staleDay)return;
 const saved=curProgress();
 const previous=saved.pendingSubmission;
 // Retry the exact frozen request: a timeout may mean the server already scored it.
 const pending=previous||{raw,automatic,kind,questionId:currentQ().id,round,date:BOOT.date,revision:BOOT.revision};
 if(previous&&previous.questionId!==currentQ().id)return;
 if(Date.now()<(pending.retryAt||0)){
  showNotice('Rate limit or connection retry is scheduled. Your answer is safely stored on this device.');
  return;
 }
 cityLookupPending=true;stopClock();++hintSequence;clearTimeout(hintTimeout);
 saved.pendingSubmission=pending;allProgress[progressKey()]=saved;saveProgress();
 const field=document.getElementById('guess'),button=document.getElementById('submitGuess');
 if(field)field.disabled=true;
 if(button){button.disabled=true;button.textContent='CHECKING…'}
 try{
  const reply=await Api.question(pending.questionId,'answer',{
   raw:pending.raw,automatic:pending.automatic,kind:pending.kind,runId:saved.runId
  });
  cityLookupPending=false;finalize(reply.result);
 }catch(error){
  cityLookupPending=false;
  const dayChanged=error.status===409||['DAY_CHANGED','QUESTION_NOT_TODAY','NO_DAILY_GAME'].includes(error.code);
  staleDay=dayChanged;
  if(error.status===400&&['EMPTY_ANSWER','INVALID_REQUEST','INPUT'].includes(error.code)){
   // Reject malformed input permanently rather than repeating the same invalid body.
   saved.pendingSubmission=null;allProgress[progressKey()]=saved;saveProgress();
   if(timerRemaining()<=0){sendAnswer('',true,'timeout');return}
   if(field)field.disabled=false;
   if(button){button.disabled=false;button.textContent='CONFIRM ↵'}
   showNotice('That answer was rejected. Correct your entry before time runs out.');
   startClock();return;
  }
  if(error.status===429){pending.retryAt=Date.now()+Math.max(1000,(error.retryAfterSeconds||30)*1000);saveProgress()}
  if(button){button.disabled=false;button.textContent=dayChanged?'LOAD TODAY ↗':'RETRY ↗'}
  if(dayChanged){
   showNotice('The daily game or its content has changed. Your previous progress is saved. Reload to start the new version.');
  }else if(error.status===401||error.status===403){
   showNotice('Game server configuration error ('+error.code+'). The submission remains saved.');
  }else if(error.status===413||error.status===415||error.status===400){
   // Do not silently send a permanently rejected request again.
   saved.pendingSubmission=null;saveProgress();
   showNotice('The server rejected this submission ('+(error.code||error.status)+'). Reload to recover.');
  }else if(error.status===429){
   showNotice('Too many requests. Your answer remains saved; retry will respect the server delay.');
  }else{
   showNotice('Could not check the answer. It is saved on this device. Reconnect and press RETRY.');
  }
 }
}
function timeoutRound(){
 if(phase!=='play'||cityLookupPending)return;
 const pending=curProgress().pendingSubmission;if(pending)return;
 const raw=(document.getElementById('guess')?.value||inputValue||'').trim();
 if(raw&&lastInputAt!==null&&lastInputAt<=deadline&&norm(raw)===norm(lastInputDraft)){sendAnswer(raw,true);return}
 sendAnswer('',true,'timeout');
}
function skipRound(){if(cityLookupPending||curProgress().pendingSubmission)return;sendAnswer('',false,'skipped')}
function nextRound(){if(round>=5){phase='end';render();return}round+=1;playRound()}
function replayDay(){if(phase!=='end')return;allProgress[progressKey()]={date:BOOT.date,revision:BOOT.revision,runId:Api.newUuidV4(),responses:[],completed:false,practice:true};saveProgress();stopClock();round=0;deadline=null;confirmedMatch=null;inputValue='';phase='intro';answerBookOpen=null;catalogueLockedHeight=null;render()}
async function submitAnswer(){
 if(staleDay){location.reload();return}
 if(phase!=='play'||cityLookupPending)return;
 const pending=curProgress().pendingSubmission;if(pending){sendAnswer(pending.raw,pending.automatic,pending.kind);return}
 if(timerRemaining()<=0){timeoutRound();return}
 const raw=(document.getElementById('guess')?.value||'').trim();if(!raw)return;
 if(confirmedMatch?.ent.canonical===raw){sendAnswer(raw);return}
 const best=singleBestCandidate(activeHints);if(best){chooseCandidate(best);return}
 // A submit before a suggestion finishes is still scored by exact server-side lookup.
 sendAnswer(raw);
}
function showNotice(t){warning=t;const e=document.getElementById('notice');if(e){e.textContent=t;e.style.display='block'}}
function submitReview(){submitAnswer()}
function showDay(n){if(!canPlayDay(n))return;stopClock();round=0;feedback=null;warning='';answerBookOpen=null;catalogueLockedHeight=null;restore()}
window.addEventListener('online',()=>{const p=curProgress().pendingSubmission;if(p&&phase==='play')sendAnswer(p.raw,p.automatic,p.kind)});
setInterval(()=>{if(document.hidden||phase!=='play'||cityLookupPending||staleDay)return;const p=curProgress().pendingSubmission;if(p)sendAnswer(p.raw,p.automatic,p.kind)},30000);
// unitLabel is defined above for user-selected display units.
function measureGap(q,value){return q.direction==='above'?value-q.limit:q.limit-value}
function directionText(q){return q.direction==='above'?'AT LEAST':'AT MOST'}
function directionalRule(q){return q.direction==='above'?'↓ FROM ABOVE · VALUES ≥ TARGET ONLY':'↑ FROM BELOW · VALUES ≤ TARGET ONLY'}
function directionArrow(q){return q.direction==='above'?'↓':'↑'}
function boundaryRange(q,b){const v=b.max_gap_inclusive;if(v===null)return 'Outside scoring range';return q.direction==='above'?displayMeasure(q,q.limit)+' to '+displayMeasure(q,q.limit+v):displayMeasure(q,q.limit-v)+' to '+displayMeasure(q,q.limit)}
function scoreZoneHTML(){return TIERS.map(t=>`<div class="zone ${feedback?.points===t.points?'active':''}"><b>${t.short}</b><span>${t.name}</span></div>`).join('')}
function cardNav(){return `<div class="card runs-card"><div class="card-head"><span>TODAY'S SIX</span><span>⌁ ${String(dayNum).padStart(3,'0')} / ${availableDays.length}</span></div><div class="run-list">${questions().map((q,i)=>{let answer=curProgress().responses[i];return `<div class="run-row ${answer?'completed':i===round&&phase!=='end'?'current':''}"><span class="n">${answer?'✓':String(i+1).padStart(3,'0')}</span>${escapeHTML(CATEGORIES[q.topic]||String(q.topic||'').toUpperCase())}<small>${answer?answer.points:'—'}</small></div>`}).join('')}</div></div>`}
function sideHTML(){const attempts=curProgress().responses.filter(Boolean).length;return `<aside class="sidebar">${cardNav()}<div class="card scorepanel"><div><div class="micro">YOUR SCORE SO FAR</div><div class="big">${formatScore(scoreSoFar())}<span> / ${formatScore(MAX)}</span></div><div class="micro">${attempts} of 6 locked</div></div><div class="meter"><div style="width:${scoreSoFar()/MAX*100}%"></div></div></div><div class="card rules-mini"><h4>TWO RULES</h4><p>Only entities matching the question’s scope qualify. Then ONE direction per question: AT MOST ↑ or AT LEAST ↓. The other side scores zero. An exact hit earns 1,200. 30 seconds, free-text answers.</p></div></aside>`}
function introHTML(){return `<div class="start-screen"><div class="launch-copy"><div class="start-kicker"><span class="sparkmark">✳</span> DAILY CHALLENGE <span class="intro-number">#${String(dayNum).padStart(3,'0')}</span></div><h2>HOW CLOSE<br>CAN YOU GET?</h2><p>Six questions. No multiple choice. See how close you can get.</p><button class="cta big main-play" id="startBtn">${curProgress().responses.filter(Boolean).length?'CONTINUE GAME':'LET’S PLAY'} <span aria-hidden="true">↗</span></button><button class="intro-rules" data-modal="rules">HOW TO PLAY <span aria-hidden="true">↗</span></button></div><aside class="launch-guide" aria-label="The daily challenge in numbers"><div class="launch-guide-title"><span>YOUR DAILY DOSE<br>OF ODDLY SPECIFIC.</span><b aria-hidden="true">✳</b></div><div class="launch-stat"><strong>06</strong><span>UNEXPECTED QUESTIONS<small>One answer. Your call.</small></span></div><div class="launch-stat"><strong>${roundTimeLimit()}<small>s</small></strong><span>FOR EACH ANSWER<small>Get close. Watch the direction.</small></span></div><div class="launch-stat"><strong>7200</strong><span>POINTS TO CHASE<small>Six perfect hits. Can you?</small></span></div></aside></div>`}
function arenaHTML(){const q=currentQ();return `<div class="arena-top"><div class="roundbadge">ROUND ${String(round+1).padStart(2,'0')} / 06 &nbsp; • &nbsp; ${escapeHTML(CATEGORIES[q.topic]||String(q.topic||'').toUpperCase())}</div><div class="clock-box run-total">${formatScore(scoreSoFar())}<small> / 7200 PTS</small></div></div><div class="arena-content"><div class="round-track" aria-label="Round ${round+1} of 6">${Array.from({length:6},(_,i)=>`<span class="${i<round?'done':i===round?'active':''}" ${i===round?'aria-current="step"':''}>${String(i+1).padStart(2,'0')}</span>`).join('')}</div><div class="question-stage"><div class="question-copy"><div class="topic-label">${escapeHTML(CATEGORIES[q.topic]||String(q.topic||'').toUpperCase())} / KNOW YOUR LIMIT</div><h2 class="question-title">${escapeHTML(displayPrompt(q))}</h2><div class="edge-direction ${q.direction==='above'?'from-above':''}" aria-label="${q.direction==='above'?'Approach only from above':'Approach only from below'}"><span class="arrow">${directionArrow(q)}</span><span>${directionalRule(q)}</span></div></div><div class="limitpanel"><small>${directionText(q)} THE TARGET &nbsp; / &nbsp; EXACT MATCH = 1200 PTS</small><strong class="limit-value ${String(displayMeasure(q,q.limit)).length>=8?'limit-long':''}">${displayMeasure(q,q.limit)}<span class="inline-unit">${escapeHTML(unitLabel(q))}</span></strong><div class="score-range-hint">SCORE WINDOW: within ${displayDistance(q,q.scoring_window.max_scoring_distance)} ${escapeHTML(unitLabel(q))} from this limit. Farther = 0 pts. </div></div></div><div class="edge-composer"><label class="input-title" for="guess">YOUR ANSWER</label><div class="edge-entrybar"><form id="answerForm" autocomplete="off"><div class="input-wrap"><div class="guess-shell"><input class="textinput" id="guess" maxlength="${q.input_max_length||115}" autocomplete="off" spellcheck="false" aria-describedby="resolvedHint" placeholder="Type an answer..." value="${escapeHTML(inputValue)}"><div class="guess-ghost" id="guessGhost" aria-hidden="true"></div></div><button type="submit" id="submitGuess" class="cta dark">CONFIRM ↵</button></div></form><div class="edge-timer-near" id="nearClock"><small>TIME</small><strong id="clock">${String(timerRemaining()).padStart(2,'0')}s</strong></div></div><div id="resolvedHint" class="typehint" style="display:none;margin-top:7px"></div><div class="notice" id="notice" role="status" style="display:${warning?'block':'none'}">${escapeHTML(warning)}</div><div class="inline-actions"><span class="typehint">⌁ ALIASES RECOGNIZED</span><button class="quiet" id="skipBtn">SKIP → 0</button></div></div><div class="footnote"><a href="${escapeHTML(q.source||'#')}" target="_blank" rel="noopener noreferrer">Dataset source ↗</a></div></div>`}
function exactCutoffs(q){return `<details class="scorebreak"><summary>SHOW SCORE BANDS +</summary><div class="cutoffrow"><b>1200 PTS</b><span>EXACTLY ${displayMeasure(q,q.limit)} ${escapeHTML(unitLabel(q))}</span></div>${q.score_bands.map((b,i)=>{let prev=i===0?0:q.score_bands[i-1].max_gap_inclusive;let sign=q.direction==='above'?'+':'−';const range=b.max_gap_inclusive===null?`Distance > ${displayDistance(q,prev)}`:`Distance > ${displayDistance(q,prev)} to ${displayDistance(q,b.max_gap_inclusive)}`;return `<div class="cutoffrow"><b>${b.points} PTS</b><span>${range} ${escapeHTML(unitLabel(q))} (${sign} from target)</span></div>`}).join('')}<div class="cutoffrow"><b>0 PTS</b><span>Wrong side of target OR farther than ${displayDistance(q,q.score_bands.at(-1).max_gap_inclusive)} ${escapeHTML(unitLabel(q))} from the limit</span></div></details>`}
function revealHTML(){
 const q=currentQ(),r=feedback;
 const known=Number.isFinite(r.metric_value);
 const signedGap=known?measureGap(q,r.metric_value):null;
 const absoluteGap=known?Math.abs(signedGap):null;
 const timedOut=r.kind==='timeout';
 const tier=r.points?r.tier:r.kind==='far'?'TOO FAR':r.kind==='over'?'OUT OF BOUNDS':r.kind==='review'?'PENDING REVIEW':r.kind==='unverified'?'NO VERIFIED DATA':r.kind==='invalid'?'INELIGIBLE':r.kind==='skipped'?'SKIPPED':'NO SCORE';
 const label=timedOut?'TIME EXPIRED':r.autoLocked?'AUTO-LOCKED AT 00s':r.kind==='scored'?'ANSWER LOCKED':r.kind==='far'?'TOO FAR FROM TARGET':r.kind==='over'?'WRONG SIDE':r.kind==='review'?'NEEDS REVIEW':r.kind==='unverified'?'UNVERIFIED YEAR':r.kind==='invalid'?'NOT ELIGIBLE':'SKIPPED';
 // For valid, on-time answers the heading IS the earned tier name.
 const title=r.kind==='scored'&&r.points>0?tier:timedOut?'TIME’S UP':r.kind==='over'?'OVER THE CLOSEISH':r.kind==='far'?'TOO FAR!':r.kind==='review'?'UNDER REVIEW':r.kind==='skipped'?'ROUND SKIPPED':'NO SCORE';
 const unit=escapeHTML(unitLabel(q));
 const distance=!known?(r.kind==='unlisted'?'—':'NOT VERIFIED'):absoluteGap<1e-9?'EXACT HIT':displayDistance(q,absoluteGap)+(unit?' '+unit:'');
 const relative=known?(signedGap < -1e-9?'WRONG SIDE OF THE LIMIT':signedGap<1e-9?'EXACTLY ON THE LIMIT':'FROM THE LIMIT'):(r.kind==='unlisted'?'—':'NO VERIFIED MEASUREMENT');
 const meta=known?`YOUR VALUE: ${displayMeasure(q,r.metric_value)}${unit?' '+unit:''} · LIMIT: ${displayMeasure(q,q.limit)}${unit?' '+unit:''}`:(r.kind==='unlisted'?'':'The entered answer has no verified numeric value.');
 const scoreNote=timedOut?'Time expired without a uniquely verified answer. 0 points.':r.kind==='far'?`Too far from the limit. Scoring stops after ${displayDistance(q,q.scoring_window.max_scoring_distance)} ${escapeHTML(unitLabel(q))}. This answer earns 0 points.`:r.kind==='over'?'An answer on the wrong side earns 0 points.':r.kind==='review'?'This answer needs verification; no points awarded yet.':r.kind==='invalid'?escapeHTML(r.reason):'';
 const answer=r.canonical||r.raw||'No answer';
 return `<div class="arena-top"><div class="roundbadge">ROUND ${String(round+1).padStart(2,'0')} / 06 &nbsp; • &nbsp; RESULT</div><div class="clock-box">✓ ROUND COMPLETE</div></div><div class="reveal reveal-compact"><div class="compact-result-title"><div class="result-emblem">✳ ${label}</div><h2 class="result-head">${escapeHTML(title)}</h2></div><div class="result-triptych"><div class="result-stat stat-points"><small>POINTS EARNED</small><strong>${formatScore(r.points)}</strong><span>/ 1200</span></div><div class="result-stat stat-gap"><small>DISTANCE TO LIMIT</small><strong>${distance}</strong><span>${relative}</span></div><div class="result-stat stat-tier"><small>YOUR ANSWER</small><strong>${escapeHTML(answer)}</strong></div></div><div class="compact-meta">${meta}</div>${scoreNote?`<div class="compact-note ${timedOut?'note-time':''}">${scoreNote}</div>`:''}<div class="result-actions"><button class="cta big" id="nextBtn">${round===5?'SEE MY SCORE ↗':'NEXT ROUND ↗'}</button></div></div>`;
}
function leaderboardHTML(q,i){
 return `<details class="answer-board"><summary><span class="ab-index">Q${i+1}</span><span class="ab-middle"><strong>${escapeHTML(CATEGORIES[q.topic]||String(q.topic||'').toUpperCase())}</strong><small>${escapeHTML(q.metric)} · ${directionText(q)} ${displayMeasure(q,q.limit)} ${escapeHTML(unitLabel(q))}</small></span><span class="ab-toggle">ANSWER CATALOGUE ↘</span></summary><div class="ab-body"><p class="ab-question">${escapeHTML(displayPrompt(q))}</p><input type="search" class="ab-search" data-search="${i}" placeholder="Search eligible answers..." aria-label="Search answers for round ${i+1}"><div class="ab-controls" data-filters="${i}">${[{label:'ALL',v:'all'},...TIERS.map(t=>({label:String(t.points),v:String(t.points)})),{label:'0',v:'0'},...(q.candidate_count?[{label:'PENDING',v:'other'}]:[])].map((t,j)=>`<button type="button" class="ab-filter ${j===0?'active':''}" data-filter="${i}:${t.v}">${t.label}</button>`).join('')}</div><div class="ab-results-count" data-count="${i}"></div><div class="ab-scroll" tabindex="0" aria-label="Scrollable answer list"><table class="ab-table"><thead><tr><th>#</th><th>ANSWER</th><th>VALUE</th><th>PTS</th></tr></thead><tbody data-rows="${i}"></tbody></table><div class="ab-empty" data-empty="${i}" hidden>No matching known entries.</div></div><button type="button" class="ab-loadmore" data-load-more="${i}" hidden>SHOW MORE ANSWERS ↘</button><a href="${escapeHTML(q.source||'#')}" target="_blank" rel="noopener noreferrer" class="ab-source">SOURCE ↗</a></div></details>`;
}
const catalogueLimits={};
let catalogueSequence=0,catalogueTimer=null;
async function populateBook(i){
 const q=questions()[i],rowEl=document.querySelector(`[data-rows="${i}"]`);if(!q||!rowEl)return;
 const seq=++catalogueSequence,query=document.querySelector(`[data-search="${i}"]`)?.value||'',filter=bookFilters[i]||'all',offset=catalogueLimits[i]||0;
 const count=document.querySelector(`[data-count="${i}"]`);if(count)count.textContent='Loading catalogue…';
 try{
  const result=await Api.question(q.id,'catalogue',{q:query,filter,offset,limit:120});
  if(seq!==catalogueSequence||!rowEl.isConnected)return;
  rowEl.innerHTML=result.entries.map((a,j)=>`<tr><td class="rank">${offset+j+1}</td><td class="who">${escapeHTML(a.canonical)}</td><td class="value">${Number.isFinite(a.metric_value)?displayMeasure(q,a.metric_value)+' '+escapeHTML(unitLabel(q)):'NO VERIFIED DATA'}</td><td><b class="pointpill ${a.points===1200?'perfect':''}">${Number.isFinite(a.metric_value)?a.points:'—'}</b></td></tr>`).join('');
  if(count)count.innerHTML=`<strong>${formatNum(result.total)} MATCHING ENTRIES</strong><small>ROWS ${result.total?offset+1:0}–${offset+result.entries.length}</small>`;
  const more=document.querySelector(`[data-load-more="${i}"]`);if(more){more.hidden=result.total<=120;more.textContent=offset+120<result.total?'NEXT 120 ANSWERS ↘':'BACK TO FIRST PAGE ↖';more.dataset.nextOffset=offset+120<result.total?offset+120:0}
  const empty=document.querySelector(`[data-empty="${i}"]`);if(empty)empty.hidden=result.entries.length!==0;
 }catch(error){if(seq===catalogueSequence&&count)count.textContent='Catalogue unavailable. Try another filter or reopen it.'}
}
const bookFilters={};
function dailyStatsHTML(){
 const state=Stats.state(BOOT.date),data=state.data;
 const heading=`<div class="mock-stat-top"><div><span class="micro">CHALLENGE #${String(dayNum).padStart(3,'0')} / DAILY RESULTS</span><h3>HOW DID YOU STACK UP?</h3></div></div>`;
 const note=state.pending?'Your result is saved on this device and waiting to sync.':state.error||'';
 if(!data||!data.total)return `<section class="mock-stat-card" aria-live="polite">${heading}<p class="chart-note">${escapeHTML(note||(!data?'Loading daily results…':'No completed results yet.'))}</p><p class="chart-note">Only completed games count. No sample results are added.</p></section>`;
 const d=globalThis.CLOSEISHChart.distribution(data,data.official?.score??scoreSoFar());
 const comparison=data.comparison,pct=comparison?.betterThanPercent;
 const practice=data.official&&data.official.runId!==curProgress().runId;
 const legacy=!data.official&&!state.pending;
 const details=`<details class="chart-data"><summary>VIEW EXACT SCORE COUNTS +</summary><table><thead><tr><th>Score</th><th>Players</th></tr></thead><tbody>${data.histogram.map(row=>`<tr><td>${row.score}</td><td>${formatNum(row.count)}</td></tr>`).join('')}</tbody></table></details>`;
 return `<section class="mock-stat-card" aria-label="Daily score distribution" aria-live="polite">${heading}${data.mode==='memory'?'<p class="chart-note"><b>LOCAL TEST DATA — resets on server restart</b></p>':''}<div class="chart-scorecards"><div class="chart-your"><span>${data.official?'COUNTED SCORE':'YOUR SCORE'}</span><strong>${formatScore(d.score)}<small> / 7200</small></strong></div><div class="chart-average"><span>DAILY AVERAGE</span><strong>${formatNum(Math.round(d.mean))}<small> pts</small></strong></div><div class="chart-percentile"><span>SCORED HIGHER THAN</span><strong>${pct==null?'—':pct.toFixed(1)}<small>${pct==null?'':'%'}</small></strong><small>${pct==null?(comparison?'Waiting for another player':'No counted score yet'):'of the other '+formatNum(comparison.others)+(comparison.others===1?' player':' players')}</small></div></div><div class="chart-canvas">${globalThis.CLOSEISHChart.svg(d)}${globalThis.CLOSEISHChart.svg(d,true)}</div><div class="chart-legend"><span><i class="legend-profile"></i>Smoothed distribution</span><span><i class="legend-average"></i>Daily average</span><span><i class="legend-you"></i>${data.official?'Counted score':'Your score'}</span></div><p class="chart-note"><b>${formatNum(data.total)} completed games</b> · ${escapeHTML(data.date)}. Ties do not count as beaten. You are excluded from your comparison. The curve is smoothed; percentages use exact scores.</p>${practice?'<p class="chart-note">Practice run: the chart uses your first completed daily result. Replays do not change it.</p>':''}${data.revision!==BOOT.revision?'<p class="chart-note">Showing the question version of your counted result.</p>':''}${legacy?'<p class="chart-note">This saved run has no verified completion. It is not included in the comparison.</p>':''}${note?`<p class="chart-note">${escapeHTML(note)}</p>`:''}<div class="chart-quartiles"><div><span>LOWER QUARTILE</span><strong>${formatNum(d.q25)}</strong><small>25th percentile</small></div><div><span>MEDIAN SCORE</span><strong>${formatNum(d.median)}</strong><small>50th percentile</small></div><div><span>UPPER QUARTILE</span><strong>${formatNum(d.q75)}</strong><small>75th percentile</small></div></div>${details}</section>`;
}

function answerCataloguePanelHTML(){
 if(answerBookOpen===null){
  return `<section class="run-answers"${catalogueLockedHeight===null?'':` style="height:${catalogueLockedHeight}px"`}><span class="micro">ROUND BY ROUND</span><h3>ANSWER<br>CATALOGUE</h3><p>Choose a question to search names and compare points.</p><div class="ab-list">${questions().map((q,i)=>`<button class="book-launch" data-open-book="${i}"><span>Q${i+1}</span><strong>${escapeHTML(displayPrompt(q))}<small>${escapeHTML(CATEGORIES[q.topic]||String(q.topic||'').toUpperCase())}</small></strong><b aria-hidden="true">↗</b></button>`).join('')}</div></section>`;
 }
 const q=questions()[answerBookOpen];
 if(!q){answerBookOpen=null;return answerCataloguePanelHTML()}
 const result=curProgress().responses[answerBookOpen];
 return `<section class="run-answers run-answers-open"${catalogueLockedHeight===null?'':` style="height:${catalogueLockedHeight}px"`}><div class="catalogue-toolbar"><button class="book-back" id="bookBack" aria-label="Back to question list">← BACK</button><span class="micro">QUESTION CATALOGUE</span></div><div class="catalogue-result-head"><h3>Q${answerBookOpen+1}</h3><div class="catalogue-my-result" aria-label="Your answer and points for question ${answerBookOpen+1}"><div class="catalogue-my-answer"><small>YOUR ANSWER</small><span>${escapeHTML(answerName(result))}</span></div><strong class="catalogue-my-points">${formatScore(result?.points??0)} <small>PTS</small></strong></div></div><p class="catalogue-question">${escapeHTML(displayPrompt(q))}</p><div class="catalogue-inline">${leaderboardHTML(q,answerBookOpen).replace(/<summary>[\s\S]*?<\/summary>/,'').replace('<details class="answer-board"','<div class="answer-board answer-board-inline"').replace('</details>','</div>')}</div></section>`;
}
// Swap only the answer catalogue, never re-render the whole results screen.
// Freeze its measured height before changing contents so all three columns stay aligned.
function swapCatalogue(nextRound){
 const previous=document.querySelector('.end-screen .run-answers');
 if(!previous)return;
 if(catalogueLockedHeight===null)catalogueLockedHeight=previous.getBoundingClientRect().height;
 answerBookOpen=nextRound;
 const holder=document.createElement('div');holder.innerHTML=answerCataloguePanelHTML();
 const replacement=holder.firstElementChild;
 previous.replaceWith(replacement);
 bindCataloguePanel();
 if(answerBookOpen!==null){replacement.querySelector('#bookBack')?.focus({preventScroll:true})}
 else replacement.querySelector(`[data-open-book="${nextRound??0}"]`)?.focus({preventScroll:true});
}
function bindCataloguePanel(){
 const panel=document.querySelector('.end-screen .run-answers');
 if(!panel)return;
 panel.querySelectorAll('[data-open-book]').forEach(b=>b.addEventListener('click',()=>swapCatalogue(Number(b.dataset.openBook))));
 panel.querySelector('#bookBack')?.addEventListener('click',()=>swapCatalogue(null));
 panel.querySelectorAll('.answer-board').forEach(d=>d.addEventListener('toggle',()=>{if(d.open&&answerBookOpen!==null)populateBook(answerBookOpen)}));
 panel.querySelectorAll('[data-search]').forEach(x=>x.addEventListener('input',()=>{catalogueLimits[+x.dataset.search]=0;clearTimeout(catalogueTimer);catalogueTimer=setTimeout(()=>populateBook(+x.dataset.search),300)}));
 panel.querySelectorAll('[data-load-more]').forEach(b=>b.addEventListener('click',()=>{let i=+b.dataset.loadMore;catalogueLimits[i]=Number(b.dataset.nextOffset||0);populateBook(i)}));
 panel.querySelectorAll('[data-filter]').forEach(x=>x.addEventListener('click',()=>{
  const [idx,tier]=x.dataset.filter.split(':');bookFilters[+idx]=tier;
  panel.querySelectorAll(`[data-filter^="${idx}:"]`).forEach(b=>b.classList.toggle('active',b===x));
  catalogueLimits[+idx]=0;populateBook(+idx);
 }));
 if(answerBookOpen!==null)populateBook(answerBookOpen);
}
// Prefer the player's literal submitted text; fall back to the resolved name.
// A skipped or timed-out blank entry has no answer.
function answerName(r){return r?.raw?.trim()||r?.canonical||'No answer'}
// Keep zero-point outcomes distinct: skipping and an unverified answer are not the same.
function summaryTier(r){
 if(!r)return 'NO SCORE';
 if(r.kind==='scored'&&Core.TIERS[r.points])return Core.TIERS[r.points];
 const zeroLabels={far:'TOO FAR',over:'CROSSED LIMIT',skipped:'SKIPPED',timeout:'TIME OUT',review:'NEEDS REVIEW',invalid:'INELIGIBLE',unverified:'NO VERIFIED DATA'};
 return zeroLabels[r.kind]||'NO SCORE';
}
function endHTML(){const results=curProgress().responses;return `<div class="end-screen"><div class="end-dashboard"><section class="run-summary"><div class="ribbon">✹ THE RUN IS DONE</div><h2>THAT WAS CLOSEISH.</h2><div class="end-score">${formatScore(scoreSoFar())}<small> / ${formatScore(MAX)}</small></div><div class="end-rows" aria-label="Point category, your answer, and earned points for each question">${questions().map((q,i)=>{const r=results[i];return `<div class="end-row"><span class="index">Q${i+1}</span><div class="end-row-detail"><strong class="tier">${escapeHTML(summaryTier(r))}</strong><div class="end-row-meta"><span class="end-row-answer">${escapeHTML(answerName(r))}</span><span class="end-row-points">${formatScore(r?.points??0)} pts</span></div></div></div>`}).join('')}</div><div class="btnrow"><button class="cta" id="shareBtn">COPY RESULTS ↗</button><button class="cta ghost" data-modal="archive">MY DAYS</button><button class="cta ghost" id="replayBtn" title="Practice again. Your first completed daily result remains in the statistics.">REPLAY DAY ↻</button></div></section>${dailyStatsHTML()}${answerCataloguePanelHTML()}</div></div>`}

function calendarHTML(){
 const base=new Date(BOOT.date+'T12:00:00Z'),first=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+archiveMonthIndex,1));
 const year=first.getUTCFullYear(),month=first.getUTCMonth(),name=first.toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).toUpperCase();
 const count=new Date(Date.UTC(year,month+1,0)).getUTCDate(),cells=Array.from({length:(first.getUTCDay()+6)%7},()=>'<span class="cal-empty"></span>');
 for(let d=1;d<=count;d++){
  const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,saved=allProgress[iso],today=iso===BOOT.date&&BOOT.available;
  const installed=BOOT.published_dates.includes(iso)||!!saved||!!originalRuns[iso],done=Boolean(saved?.completed||originalRuns[iso]?.completed),partial=!done&&(saved?.responses?.length||saved?.activeRound!==undefined);
  const status=done?'DONE':partial?`${saved.responses?.filter(Boolean).length||0}/6`:installed?'MISSED':iso>BOOT.date?'FUTURE':'—';
  cells.push(`<button class="cal-day ${done?'cal-completed':today?'cal-selected':'cal-upcoming'}" ${today?`data-day="${dayNum}"`:'disabled'} aria-label="${iso}: ${status}"><span class="cal-date">${d}</span><small>${today&&!done&&!partial?'TODAY':status}</small>${done?'<span class="cal-check">✓</span>':''}</button>`);
 }
 return `<div class="closeish-calendar"><div class="cal-top"><button class="cal-nav" data-cal-step="-1" aria-label="Previous month">‹</button><div class="cal-heading">${name}<small>${escapeHTML(BOOT.timezone)}</small></div><button class="cal-nav" data-cal-step="1" aria-label="Next month">›</button></div><div class="cal-weekdays">${['MON','TUE','WED','THU','FRI','SAT','SUN'].map(n=>`<span>${n}</span>`).join('')}</div><div class="cal-grid">${cells.join('')}</div><p class="typehint">Only today’s game is playable. Past progress stays on this device. 2/6 means two answers are locked; DONE means all six are complete.</p></div>`;
}
let bookRound=0;
let answerBookOpen=null;
let catalogueLockedHeight=null;
let modalTrigger='[data-modal="rules"]';
function closeOverlay(){showModal=null;render();document.querySelector(modalTrigger)?.focus()}
function modalHTML(){
 if(!showModal)return '';
 const community=globalThis.CLOSEISHCommunity;
 const content=showModal==='rules'?community.guideHTML():showModal==='suggest'?community.suggestionHTML():showModal==='archive'?calendarHTML():showModal==='stats'?(dailyStatsHTML().match(/<details class="chart-data">[\s\S]*?<\/details>/)?.[0]||'<p>Statistics are not available yet.</p>').replace('<details','<details open'):'<h3>THE DAILY GAME OF LIMITS.</h3><p>Six questions. One edge.</p>';
 const title=showModal==='rules'?'HOW TO PLAY':showModal==='suggest'?'SUGGEST A QUESTION':showModal==='archive'?'MY DAYS':showModal==='stats'?'DAILY SCORE COUNTS':'ABOUT CLOSEISH';
 return `<div class="modalwrap" id="modalWrap"><div class="modal modal-${showModal}" role="dialog" aria-modal="true" aria-labelledby="overlayTitle"><div class="modalhead"><strong id="overlayTitle">${title}</strong><button id="closeModal" class="closebtn" aria-label="Close">×</button></div>${phase==='play'?'<div class="modal-timer-note" role="note">Your round timer keeps running while this is open.</div>':''}<div class="modalcontent">${content}</div></div></div>`;
}
document.addEventListener('keydown',event=>{
 if(!showModal)return;
 if(event.key==='Escape'){event.preventDefault();closeOverlay();return}
 if(event.key!=='Tab')return;
 const nodes=[...document.querySelectorAll('.modal button:not(:disabled),.modal input:not(:disabled),.modal textarea,.modal select,.modal a[href],.modal [tabindex="0"]')].filter(n=>!n.hidden);
 const first=nodes[0],last=nodes[nodes.length-1];
 if(event.shiftKey&&(document.activeElement===first||!nodes.includes(document.activeElement))){event.preventDefault();last?.focus()}
 else if(!event.shiftKey&&(document.activeElement===last||!nodes.includes(document.activeElement))){event.preventDefault();first?.focus()}
});

function unavailableHTML(){return `<div class="start-screen"><div class="start-kicker">DAILY CHALLENGE</div><h2>NOT AVAILABLE<br>YET.</h2><p>No question set is published for today. Your previous progress is saved. Come back when a new daily game is published.</p><button class="cta big" data-modal="archive">OPEN MY DAYS ↗</button></div>`}
function render(){document.body.classList.toggle('edge-ended',phase==='end');document.body.classList.toggle('edge-playing',phase==='play');document.body.classList.toggle('edge-run',phase!=='intro');document.body.classList.toggle('edge-intro',phase==='intro');const p=curProgress();if(phase==='intro'&&p.completed)phase='end';const inner=!dayPack()?unavailableHTML():phase==='intro'?introHTML():phase==='play'?arenaHTML():phase==='reveal'?revealHTML():endHTML();el.innerHTML=`<header class="topbar"><div class="top-inner"><button class="logo" id="homeBtn" type="button" aria-label="${phase==='play'||phase==='reveal'?'Home navigation unavailable during the challenge':'CLOSEISH home'}" ${phase==='play'||phase==='reveal'?'disabled title="Finish all six rounds to return home"':''}>CLOSE<span class="period">ISH</span><svg viewBox="0 0 28 28" aria-hidden="true"><path fill="#ff6a55" stroke="#19151f" stroke-width="2" d="M14 1L18 9 27 7 22 15 27 23 17 21 13 28 10 19 1 20 6 13 2 5 11 9Z"/></svg></button><nav class="mainnav" aria-label="Main navigation">${unitControlHTML()}<button class="navbutton navsuggest" data-modal="suggest">SUGGEST +</button><button class="navbutton" data-modal="rules">HOW TO PLAY</button><button class="navbutton navarchive" data-modal="archive">MY DAYS ↗</button></nav></div></header><div class="ticker"><span>${('✳ KNOW IT. RISK IT. NAIL IT. &nbsp;&nbsp;&nbsp; ✳ ANY TOPIC. ONE LIMIT. &nbsp;&nbsp;&nbsp; ✳ NO GUESSING FROM A LIST. &nbsp;&nbsp;&nbsp; ').repeat(9)}</span></div><section class="hero"><div class="hero-inner"><div class="hero-copy"><div class="eyebrow"><i class="line"></i> THE DAILY GAME OF LIMITS</div><h1>CLOSE<span>ISH</span></h1><p class="hero-sub">Know something weird? <em>Put it on the line.</em></p></div><div class="hero-art" aria-hidden="true"><div class="art-panel"><div class="art-limit"></div><div class="art-label">THE LIMIT</div><svg class="art-line" viewBox="0 0 250 160"><polyline points="5,138 42,118 81,127 116,85 151,98 183,43 211,64 240,12"/><circle cx="240" cy="12" r="11"/></svg></div><div class="art-sticker">CLOSE<br>CALL!</div></div></div></section><div class="breakline">★ <b>THINK HARD</b> ★ <b>GO BIG</b> ★ <b>CHECK THE DIRECTION</b> ★ <b>COME BACK TOMORROW</b> ★</div><main class="shell content"><div class="section-head"><div><div class="micro">THE DAILY CHALLENGE</div></div><div class="day-badge">${dayPack()?'CHALLENGE #'+String(dayNum).padStart(3,'0'):BOOT.date}</div></div><div class="playgrid"> <section class="card maincard" id="gameArea">${inner}</section></div></main><footer class="shell footer"><strong>CLOSEISH / KNOW YOUR LIMITS.</strong><span>Wildly specific limits. Free-text answers. No ads.</span></footer>${modalHTML()}`;
 bindUnitControl();
 document.getElementById('homeBtn')?.addEventListener('click',()=>{if(phase==='play'||phase==='reveal')return;stopClock();answerBookOpen=null;catalogueLockedHeight=null;phase=curProgress().completed?'end':'intro';render()});document.querySelectorAll('[data-modal]').forEach(b=>b.addEventListener('click',()=>{modalTrigger=`[data-modal="${b.dataset.modal}"]`;showModal=b.dataset.modal;if(showModal==='rules')globalThis.CLOSEISHCommunity.resetGuide();if(showModal==='archive')archiveMonthIndex=0;render()}));document.getElementById('closeModal')?.addEventListener('click',closeOverlay);document.getElementById('modalWrap')?.addEventListener('mousedown',e=>{if(e.target.id==='modalWrap')closeOverlay()});document.querySelectorAll('[data-cal-step]').forEach(b=>b.addEventListener('click',()=>{archiveMonthIndex+=Number(b.dataset.calStep);render()}));document.querySelectorAll('[data-day]').forEach(b=>b.addEventListener('click',()=>{showModal=null;showDay(+b.dataset.day)}));
 document.getElementById('startBtn')?.addEventListener('click',()=>{let saved=curProgress();if(Number.isInteger(saved.activeRound)&&saved.activeDeadline){round=saved.activeRound;deadline=saved.activeDeadline;restoreDraft(saved);phase='play';render();if(timerRemaining()<=0)timeoutRound();else startClock();return}round=saved.responses.findIndex(x=>!x);if(round<0)round=saved.responses.length||0;playRound()});document.getElementById('answerForm')?.addEventListener('submit',e=>{e.preventDefault();submitAnswer()});
 const field=document.getElementById('guess');if(field){field.addEventListener('input',updateHints);if(inputValue){activeHints=candidateMatches(currentQ(),inputValue);refreshInlineHint()}}
 document.getElementById('replayBtn')?.addEventListener('click',replayDay);document.getElementById('skipBtn')?.addEventListener('click',skipRound);document.getElementById('nextBtn')?.addEventListener('click',nextRound);document.getElementById('reviewBtn')?.addEventListener('click',submitReview);document.getElementById('shareBtn')?.addEventListener('click',share);
 bindCataloguePanel();
 document.querySelector('.end-screen .chart-data summary')?.addEventListener('click',e=>{e.preventDefault();modalTrigger='.end-screen .chart-data summary';showModal='stats';render()});
 document.body.classList.toggle('overlay-open',Boolean(showModal));
 [...el.children].forEach(child=>{if(child.id!=='modalWrap')child.inert=Boolean(showModal)});
 if(showModal==='suggest')globalThis.CLOSEISHCommunity.bindSuggestion();
 if(showModal==='rules')globalThis.CLOSEISHCommunity.bindGuide(render,closeOverlay);
 if(showModal)document.getElementById('closeModal')?.focus();
}
async function share(){const p=curProgress(),score=scoreSoFar();const grid=p.responses.map(r=>r.points===1200?'🟪':r.points===1000?'🟩':r.points>=600?'🟦':r.points>=200?'🟨':'⬛').join('');let text=`CLOSEISH #${String(dayNum).padStart(3,'0')} — ${score}/${MAX}\n${grid}\nSix rounds. One edge.`;try{await navigator.clipboard.writeText(text);let b=document.getElementById('shareBtn');if(b)b.textContent='COPIED ✓'}catch{prompt('Copy your results:',text)}}
function restore(){
 if(!dayPack()){phase='intro';render();return}
 const saved=curProgress();
 if(!Array.isArray(saved.responses)||saved.responses.length>6){delete allProgress[progressKey()];phase='intro';render();return}
 if(saved.completed){phase='end';render();Stats.complete(saved);return}
 if(saved.pendingSubmission){round=saved.pendingSubmission.round;deadline=saved.activeDeadline;restoreDraft(saved);phase='play';render();sendAnswer(saved.pendingSubmission.raw,saved.pendingSubmission.automatic,saved.pendingSubmission.kind);return}
 if(Number.isInteger(saved.activeRound)&&saved.activeRound>=0&&saved.activeRound<6&&saved.activeDeadline){round=saved.activeRound;deadline=saved.activeDeadline;restoreDraft(saved);phase='play';render();if(timerRemaining()<=0)timeoutRound();else startClock();return}
 if(saved.phase==='reveal'&&saved.responses[saved.lastRound]){round=saved.lastRound;feedback=saved.responses[round];phase='reveal';render();return}
 phase='intro';render();
}
window.addEventListener('closeish-statistics',()=>{
 const panel=document.querySelector('.end-screen .mock-stat-card');
 if(panel){const holder=document.createElement('div');holder.innerHTML=dailyStatsHTML();panel.replaceWith(holder.firstElementChild);}
});
setInterval(()=>{if(!document.hidden&&curProgress().completed)Stats.refresh(BOOT.date,BOOT.revision)},30000);
saveProgress();restore();
})();
