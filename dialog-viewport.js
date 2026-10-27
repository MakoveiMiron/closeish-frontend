/* CLOSEISH: fit non-scrolling dialogs to the actual visible viewport.
 * Kept separate from page fitting: a popup must never inherit the page zoom.
 * The answer catalogue's table may still scroll INSIDE its own list.
 */
(()=>{'use strict';
 const root=document.documentElement;
 let scheduled=false;
 function fit(){
  scheduled=false;
  const modal=document.querySelector('#modalWrap .modal');
  if(!modal)return;
  const vv=window.visualViewport;
  const width=Math.max(1,Math.min(window.innerWidth,vv?.width||window.innerWidth));
  const height=Math.max(1,Math.min(window.innerHeight,vv?.height||window.innerHeight));
  const pad=width<=700?9:18;
  // A virtual keyboard may cover suggestion inputs. Keep the focused field
  // reachable, instead of forcing an unusably tiny dialog.
  const keyboardOpen=width<=700&&document.activeElement?.matches('.modal input,.modal textarea')&&
   (window.innerHeight-height)>100;
  if(keyboardOpen){modal.style.zoom='';modal.classList.add('dialog-keyboard');return;}
  modal.classList.remove('dialog-keyboard');
  modal.style.zoom='1';
  const usableH=height-pad*2-4,usableW=width-pad*2-4;
  function measures(){const rect=modal.getBoundingClientRect();return {h:Math.max(rect.height,modal.scrollHeight*(Number(modal.style.zoom)||1)),w:Math.max(rect.width,modal.scrollWidth*(Number(modal.style.zoom)||1))}}
  let {h,w}=measures();
  if(h<=usableH&&w<=usableW)return;
  // Start with natural-size geometry. Percentage widths reflow under CSS zoom,
  // so a measured ratio is more stable than binary-searching changing widths.
  let scale=Math.min(1,usableH/h,usableW/w);
  modal.style.zoom=String(Math.max(.50,Math.min(1,scale-.008)));
  ({h,w}=measures());
  if(h>usableH||w>usableW){
   scale=(Number(modal.style.zoom)||1)*Math.min(usableH/h,usableW/w);
   modal.style.zoom=String(Math.max(.50,Math.min(1,scale-.009)));
  }
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>requestAnimationFrame(fit))}}
 const observer=new MutationObserver(schedule);
 observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
 window.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('resize',schedule,{passive:true});
 document.addEventListener('focusin',schedule);
 document.addEventListener('focusout',schedule);
 globalThis.CLOSEISHDialogViewport={sync:schedule};
 schedule();
})();
