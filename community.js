(function(root){
'use strict';
// Public suggestions go directly to the backend; no local history, export or drafts.
// Clear older front-end-only demo data: it was NEVER sent to the server.
try{localStorage.removeItem('closeish-question-suggestions-v1');localStorage.removeItem('closeish-question-draft-v1');}catch{}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lastSubmitted=null;
function valid(d){
 const errors={};const q=String(d.question||'').trim();
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
 <textarea id="suggestQuestion" name="question" rows="3" maxlength="350" required placeholder="e.g. Name a film that's under 2 hours long…" aria-describedby="error-question"></textarea>
 <span class="field-error" id="error-question"></span>
 <fieldset class="direction-picker suggest-direction" aria-describedby="error-direction"><legend>APPROACH FROM… <span class="required-note">REQUIRED</span></legend><div>
 ${[['below','↑','FROM BELOW','At or below the limit'],['above','↓','FROM ABOVE','At or above the limit']].map(([v,a,t,desc])=>`<label class="direction-option"><input type="radio" name="direction" value="${v}" required><span><b class="direction-symbol">${a}</b><strong>${t}</strong><small>${desc}</small></span></label>`).join('')}
 </div><span class="field-error" id="error-direction"></span></fieldset>
 <div class="suggest-bottom-simple"><div class="suggest-local"><b>DIRECT SUBMISSION</b><span>Sent privately to CLOSEISH. Previous ideas aren't public.</span></div><button type="submit" class="cta" id="submitSuggestion">SEND IDEA ↗</button></div>
 <div id="suggestionStatus" role="status" class="suggestion-status" tabindex="-1" aria-live="polite"></div>
 </form></div>`;
}
function bindSuggestion(){
 const form=document.getElementById('suggestionForm');if(!form)return;
 const status=document.getElementById('suggestionStatus');
 let sending=false;
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(sending)return;
  const data=new FormData(form),values={question:String(data.get('question')||'').trim(),direction:String(data.get('direction')||'')};
  const errors=valid(values);
  form.querySelectorAll('.field-error').forEach(n=>n.textContent='');
  form.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
  for(const [field,message] of Object.entries(errors)){
   document.getElementById(`error-${field}`).textContent=message;
   form.querySelector(`[name="${field}"]`)?.setAttribute('aria-invalid','true');
  }
  if(Object.keys(errors).length){status.textContent='Please complete the two fields.';form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();return;}
  const fingerprint=JSON.stringify(values);
  if(lastSubmitted===fingerprint){status.textContent='This idea has already been sent. Edit it to submit another.';status.focus();return;}
  sending=true;const button=form.querySelector('#submitSuggestion');button.disabled=true;
  status.classList.remove('is-saved');status.textContent='Sending your idea securely…';
  try{
   const response=await root.CLOSEISHApi.post('/api/v1/suggestions',values);
   if(response?.ok!==true)throw new Error('No receipt from server');
   lastSubmitted=fingerprint;status.textContent='Thanks! Your idea reached CLOSEISH. It is not publicly visible.';
   status.classList.add('is-saved');form.reset();
  }catch(error){
   status.textContent=error?.status===429?'Too many submissions. Please try again later.':
    'Could not send your idea. Please check your connection and try again; it has not been marked as received.';
  }finally{sending=false;button.disabled=false;status.focus();}
 });
}
function guideHTML(){return `<section class="guide-single" aria-labelledby="guideSingleTitle">
 <div class="guide-hero-line"><span class="micro">SIX ROUNDS. ONE EDGE.</span><span class="guide-stamp">HOW CLOSE?</span></div>
 <h3 id="guideSingleTitle">NAME IT. GET CLOSE.<br><em>DON'T CROSS.</em></h3>
 <p class="guide-lead">Each question gives you a numerical limit. <strong>Name something</strong> as close to that limit as you can — from the allowed side.</p>
 <div class="guide-example"><span class="micro">FOR EXAMPLE</span><p>Name a movie <strong>at most 120 minutes</strong> long.</p>
 <div class="guide-limit-row"><span class="guide-direction-chip">↑ AT MOST</span><strong>120<span> MIN</span></strong></div>
 <div class="guide-example-answers"><div><b>120 min</b><span>PERFECT · 1200 PTS</span></div><div><b>118 min</b><span>CLOSE · SCORES</span></div><div><b>135 min</b><span>WRONG SIDE · 0 PTS</span></div></div>
 <small>You type a movie title, not a number. Going too far from the limit also earns 0 points.</small></div>
 <div class="guide-bottom"><div class="guide-facts"><span><strong>06</strong> QUESTIONS</span><span><strong>30s</strong> EACH</span><span><strong>7200</strong> MAX POINTS</span></div><button type="button" class="cta" id="guideDone">GOT IT ↗</button></div>
 </section>`;}
function bindGuide(refresh,close){document.getElementById('guideDone')?.addEventListener('click',close)}
root.CLOSEISHCommunity={suggestionHTML,bindSuggestion,guideHTML,bindGuide,resetGuide:()=>{},valid};
})(globalThis);
