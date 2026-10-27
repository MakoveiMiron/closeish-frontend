/* CLOSEISH V18.5: fit the actual rendered app to one visible viewport.
 * Zoom is scoped to #app. Do not change device/browser zoom or the user's
 * pinch-to-zoom setting. Phone timed rounds retain mobile-viewport.js control.
 * The modal remains independently scrollable for accessible long content.
 */
(()=>{'use strict';
 const root=document.documentElement;
 const app=document.getElementById('app');
 if(!app)return;
 let raf=0,measuring=false,last=0;
 const viewport=()=>({w:Math.max(1,window.innerWidth),h:Math.max(1,window.innerHeight)});
 const mobileLayout=()=>window.innerWidth<=700;
 const hasDialog=()=>Boolean(document.querySelector('#modalWrap')); 
 function fits(w,h){
  const page=document.documentElement;
  // 2px tolerance allows rounded CSS shadows/borders; never clip essential text.
  return page.scrollHeight<=h+1&&page.scrollWidth<=w+1;
 }
 function fit(){
  raf=0;
  if(measuring)return;
  measuring=true;
  try{
   if(mobileLayout()||hasDialog()||root.classList.contains('closeish-session-blocked')){
    app.style.zoom='';root.classList.remove('closeish-viewport-fit');last=1;return;
   }
   const {w,h}=viewport();
   app.style.zoom='1';
   if(fits(w,h)){
    last=1;root.classList.remove('closeish-viewport-fit');return;
   }
   // Find the *largest* comfortable fit, not an arbitrary fixed breakpoint.
   // Reflow can change text wrapping, so inspect actual scroll dimensions
   // at each size instead of assuming height scales linearly.
   let low=.30, high=1, best=.30;
   for(let i=0;i<12;i++){
    const mid=(low+high)/2;
    app.style.zoom=String(mid);
    if(fits(w,h)){best=mid;low=mid}else high=mid;
   }
   app.style.zoom=String(Math.max(.30,Math.floor((best-.002)*1000)/1000));
   last=Number(app.style.zoom)||1;
   root.classList.add('closeish-viewport-fit');
  }finally{measuring=false;}
 }
 function requestFit(){if(!raf)raf=requestAnimationFrame(fit)}
 window.addEventListener('resize',requestFit,{passive:true});
 window.addEventListener('orientationchange',requestFit,{passive:true});
 window.visualViewport?.addEventListener('resize',requestFit,{passive:true});
 window.addEventListener('load',requestFit,{once:true});
 document.fonts?.ready.then(requestFit).catch(()=>{});
 // Game replaces #app children after answer/restore and archive day selection.
 // Subtree child changes cover those transitions without polling or touching
 // the game's clock. #app's style change itself is intentionally NOT observed.
 const appChanges=new MutationObserver(requestFit);
 appChanges.observe(app,{subtree:true,childList:true});
 const phaseChanges=new MutationObserver(requestFit);
 phaseChanges.observe(document.body,{attributes:true,attributeFilter:['class']});
 root.style.setProperty('--closeish-layout-engine','viewport-fit');
 globalThis.CLOSEISHViewportFit={sync:requestFit,getScale:()=>last};
 requestFit();
})();
