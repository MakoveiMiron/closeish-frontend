/* CLOSEISH V18.3 — game viewport follows the visible (keyboard-free) area.
 * Never change browser zoom or prevent pinch zoom. Only the PLAY view is fixed.
 */
(()=>{'use strict';
 const root=document.documentElement,body=document.body;
 if(!body)return;
 const vv=window.visualViewport;
 let fullHeight=Math.max(1,vv?.height||window.innerHeight);
 let scheduled=false;
 function fitQuestion(){
  if(!body.classList.contains('edge-playing')||window.innerWidth>700)return;
  const stage=document.querySelector('#gameArea .question-stage');
  const prompt=document.querySelector('#gameArea .question-title');
  if(!stage||!prompt)return;
  // When the virtual keyboard is visible we favour the complete question,
  // the direction, the numeric limit and the answer field over ornaments.
  const typing=body.classList.contains('closeish-keyboard-open');
  const base=typing?20:25;
  prompt.style.fontSize=base+'px';
  const min=typing?11.5:14;
  const available=Math.max(0,stage.clientHeight);
  for(let size=base;size>=min;size-=.5){
   prompt.style.fontSize=size+'px';
   if(stage.scrollHeight<=available+1)break;
  }
 }
 function sync(){
  scheduled=false;
  const isMobile=window.innerWidth<=700;
  const playing=body.classList.contains('edge-playing');
  const focused=document.activeElement?.id==='guess';
  const currentHeight=vv?.height||window.innerHeight;
  // Update the baseline only without an input focused; it must not shrink
  // when iOS/Android brings up its on-screen keyboard.
  if(!focused)fullHeight=currentHeight;
  const keyboard=isMobile&&playing&&focused&&fullHeight-currentHeight>105;
  root.style.setProperty('--closeish-visible-height',`${Math.round(currentHeight)}px`);
  root.style.setProperty('--closeish-visible-top',`${Math.max(0,Math.round(vv?.offsetTop||0))}px`);
  body.classList.toggle('closeish-keyboard-open',keyboard);
  if(!playing)body.classList.remove('closeish-keyboard-open');
  fitQuestion();
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(sync)}}
 vv?.addEventListener('resize',schedule);
 vv?.addEventListener('scroll',schedule);
 window.addEventListener('resize',schedule);
 window.addEventListener('orientationchange',()=>{if(document.activeElement?.id!=='guess')fullHeight=vv?.height||innerHeight;schedule()});
 document.addEventListener('focusin',schedule);
 document.addEventListener('focusout',()=>{requestAnimationFrame(schedule)});
 // The app replaces its game DOM between rounds and after restoring progress.
 globalThis.CLOSEISHMobileViewport={sync:schedule};
 schedule();
})();
