(function(root){
'use strict';
// Ideas stay on this device until a backend/submission endpoint is added.
const KEY='closeish-question-suggestions-v1',DRAFT='closeish-question-draft-v1';
const fields=['question','direction'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
let draft=read(DRAFT,{});
if(!draft||typeof draft!=='object'||Array.isArray(draft))draft={};
let saved=read(KEY,[]);
if(!Array.isArray(saved))saved=[];
let lastSaved=null;
function valid(d){
 const errors={};
 const q=String(d.question||'').trim();
 if(q.length<8)errors.question='Write a question idea (at least 8 characters).';
 else if(q.length>350)errors.question='Keep the idea within 350 characters.';
 if(!['below','above'].includes(d.direction))errors.direction='Choose a direction.';
 return errors;
}
function suggestionHTML(){
 return `<div class="suggest-simple">
 <div class="suggest-simple-intro"><span class="micro">YOUR IDEA, OUR NEXT CHALLENGE?</span><h3>GOT A GOOD ONE?</h3><p>Write your question idea. Choose the side players should approach from. The final question, limit and scoring will be researched and refined later.</p></div>
 <form id="suggestionForm" novalidate>
 <label class="suggest-field" for="suggestQuestion">YOUR QUESTION <span class="required-note">REQUIRED</span></label>
 <textarea id="suggestQuestion" name="question" rows="3" maxlength="350" required placeholder="e.g. Name a film that's under 2 hours long…" aria-describedby="error-question">${esc(draft.question||'')}</textarea>
 <span class="field-error" id="error-question"></span>
 <fieldset class="direction-picker suggest-direction" aria-describedby="error-direction"><legend>APPROACH FROM… <span class="required-note">REQUIRED</span></legend><div>
 ${[['below','↑','FROM BELOW','At or below the limit'],['above','↓','FROM ABOVE','At or above the limit']].map(([v,a,t,desc])=>`<label class="direction-option"><input type="radio" name="direction" value="${v}" ${draft.direction===v?'checked':''} required><span><b class="direction-symbol">${a}</b><strong>${t}</strong><small>${desc}</small></span></label>`).join('')}
 </div><span class="field-error" id="error-direction"></span></fieldset>
 <div class="suggest-bottom-simple"><div class="suggest-local"><b>LOCAL DEMO</b><span>Saved only in this browser, not submitted online.</span></div><button type="submit" class="cta">SAVE IDEA ↗</button></div>
 <p id="draftStatus" class="draft-status" role="status">Your draft is saved on this device as you type.</p>
 <div id="suggestionStatus" role="status" class="suggestion-status" tabindex="-1"></div>
 <div class="suggest-export"><span id="suggestionCount">${saved.length} SAVED IDEA${saved.length===1?'':'S'}</span><button type="button" class="cta ghost" id="exportSuggestions" ${saved.length?'':'disabled'}>DOWNLOAD IDEAS ↓</button></div>
 </form></div>`;
}
function collect(form){const data=new FormData(form);return Object.fromEntries(fields.map(n=>[n,String(data.get(n)||'')]))}
function writeDraft(){try{localStorage.setItem(DRAFT,JSON.stringify(draft));return true}catch{return false}}
function bindSuggestion(){
 const form=document.getElementById('suggestionForm');if(!form)return;
 const status=document.getElementById('suggestionStatus');
 function update(){status.textContent='';status.classList.remove('is-saved');draft=collect(form);const ok=writeDraft();document.getElementById('draftStatus').textContent=ok?'Draft saved on this device.':'Browser storage is unavailable. Download your idea after saving.';}
 form.addEventListener('input',update);form.addEventListener('change',update);
 form.addEventListener('submit',e=>{
  e.preventDefault();update();const errors=valid(draft);
  form.querySelectorAll('.field-error').forEach(n=>n.textContent='');form.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
  for(const [name,message]of Object.entries(errors)){document.getElementById(`error-${name}`).textContent=message;form.querySelector(`[name="${name}"]`)?.setAttribute('aria-invalid','true')}
  if(Object.keys(errors).length){status.textContent='Please complete the two fields.';form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();return}
  const values={question:draft.question.trim(),direction:draft.direction};
  const fingerprint=JSON.stringify(values);
  if(lastSaved===fingerprint){status.textContent='Already saved. Edit your idea to save another.';status.focus();return}
  const item={id:root.crypto?.randomUUID?.()||`suggestion-${Date.now()}-${saved.length}`,created_at:new Date().toISOString(),status:'local_only',question:values.question,direction:values.direction};
  saved.push(item);lastSaved=fingerprint;let persisted=true;
  try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{persisted=false}
  document.getElementById('suggestionCount').textContent=`${saved.length} SAVED IDEA${saved.length===1?'':'S'}`;
  document.getElementById('exportSuggestions').disabled=false;
  status.textContent=persisted?'Saved on this device. Not sent to the team — download the JSON to share it.':'Storage unavailable. Idea saved in memory only — download before closing.';
  status.classList.add('is-saved');status.focus();
 });
 document.getElementById('exportSuggestions')?.addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({format:'closeish-question-suggestions-v2',exported_at:new Date().toISOString(),suggestions:saved},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='closeish-question-ideas.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
}
function guideHTML(){return `<section class="guide-single" aria-labelledby="guideSingleTitle">
 <div class="guide-hero-line"><span class="micro">SIX ROUNDS. ONE EDGE.</span><span class="guide-stamp">HOW CLOSE?</span></div>
 <h3 id="guideSingleTitle">NAME IT. GET CLOSE.<br><em>DON'T CROSS.</em></h3>
 <p class="guide-lead">Each question gives you a numerical limit. <strong>Name something</strong> as close to that limit as you can — from the allowed side.</p>
 <p class="guide-lead"><strong>Eligibility comes first:</strong> name an entity from the question’s category. Extra eligibility restrictions are used when the natural answer pool would exceed 10,000 entities; any such restrictions must be clear in the question. A valid name on the wrong side of the limit scores 0 points.</p>
 <div class="guide-example"><span class="micro">FOR EXAMPLE</span><p>Name a movie <strong>at most 120 minutes</strong> long.</p>
 <div class="guide-limit-row"><span class="guide-direction-chip">↑ AT MOST</span><strong>120<span> MIN</span></strong></div>
 <div class="guide-example-answers"><div><b>120 min</b><span>PERFECT · 1200 PTS</span></div><div><b>118 min</b><span>CLOSE · SCORES</span></div><div><b>135 min</b><span>WRONG SIDE · 0 PTS</span></div></div>
 <small>You type a movie title, not a number. Going too far from the limit also earns 0 points.</small></div>
 <div class="guide-bottom"><div class="guide-facts"><span><strong>06</strong> QUESTIONS</span><span><strong>30s</strong> EACH</span><span><strong>7200</strong> MAX POINTS</span></div><button type="button" class="cta" id="guideDone">GOT IT ↗</button></div>
 </section>`;}
function bindGuide(refresh,close){document.getElementById('guideDone')?.addEventListener('click',close)}
root.CLOSEISHCommunity={suggestionHTML,bindSuggestion,guideHTML,bindGuide,resetGuide:()=>{},valid};
})(globalThis);
