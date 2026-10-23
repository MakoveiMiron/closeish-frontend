"""Offline browser tests: tab lock warning and visual viewport keyboard layout."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HTML=re.sub(r'<script\b[^>]*>.*?</script>|<link\b[^>]*>|<meta\s+http-equiv="Content-Security-Policy"[^>]*>','',(ROOT/'index.html').read_text(),flags=re.I|re.S)
ASSETS={name:(ROOT/name).read_text() for name in ['view-core.js','community.js','score-chart.js','statistics-client.js','game.js']}
QUESTIONS={f'q{i}':{
 'id':f'q{i}','date':'2026-10-23','day_number':1,'topic':'history',
 'prompt':'Name a historical location with a sufficiently documented event that occurred before the year 2000. Include the location name, not the year.' if i==1 else 'Name a country.',
 'metric':'year','unit':'year','direction':'below','limit':2000,'time_limit_seconds':30,
 'score_bands':[{'max_gap_inclusive':0,'points':1200,'tier':'PERFECT HIT'}],
 'scoring_window':{'max_scoring_distance':200,'units':'year','exact_match_points':1200},
 'input_max_length':115,'source':'https://example.org/','candidate_count':0
} for i in range(1,7)}
TODAY={'date':'2026-10-23','current_date':'2026-10-23','timezone':'Europe/Budapest',
 'available':True,'day_number':1,'revision':'abc123','published_dates':['2026-10-23'],
 'statistics':'postgres','questions':QUESTIONS}
PROGRESS={'month':'2026-10','days':[],'progress':None,'counted':False}

def open_page(context,blocked=False):
 page=context.new_page()
 page.goto('about:blank')
 page.set_content(HTML)
 page.add_style_tag(content=(ROOT/'style.css').read_text())
 page.evaluate('''assets => {
   window.__assets=assets;
   window.CLOSEISH_CONFIG={apiBase:'https://closeish-production.up.railway.app',apiKey:''};
   const orig=document.head.appendChild.bind(document.head);
   document.head.appendChild=script=>{
     if(script.tagName==='SCRIPT'&&script.src){
       queueMicrotask(()=>{try{(0,eval)(window.__assets[script.src.split('?')[0].split('/').pop()]);script.onload?.()}catch(e){script.onerror?.(e);throw e}});
       return script;
     }
     return orig(script);
   };
 }''',ASSETS)
 page.add_script_tag(content=(ROOT/'mobile-viewport.js').read_text())
 if blocked:
  page.evaluate("Object.defineProperty(navigator,'locks',{value:{request:(_,__,fn)=>fn(null)},configurable:true})")
 else:
  page.evaluate("Object.defineProperty(navigator,'locks',{value:undefined,configurable:true})")
  page.evaluate('''values=>{window.fetch=url=>Promise.resolve(new Response(JSON.stringify(String(url).includes('/today')?values[0]:values[1]),{status:200,headers:{'Content-Type':'application/json'}}))}''',[TODAY,PROGRESS])
 page.add_script_tag(content=(ROOT/'api.js').read_text())
 return page

def metrics(page):
 return page.evaluate('''()=>{
 const rect=sel=>{const x=document.querySelector(sel).getBoundingClientRect();return {top:x.top,bottom:x.bottom,height:x.height}};
 const stage=document.querySelector('.question-stage');
 return {question:rect('.question-title'),input:rect('#guess'),limit:rect('.limitpanel'),
  direction:rect('.edge-direction'),submit:rect('#submitGuess'),stageScroll:stage.scrollHeight,
  stageClient:stage.clientHeight,htmlScroll:document.documentElement.scrollHeight,
  keyboard:document.body.classList.contains('closeish-keyboard-open')};
 }''')

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 blocked=open_page(context,True)
 blocked.locator('#alreadyOpenPage:visible').wait_for(timeout=7000)
 assert blocked.get_by_role('heading',name='ALREADY OPEN.').is_visible()
 assert not blocked.locator('#startBtn').is_visible()
 assert not blocked.locator('#restoreSplash').is_visible()
 blocked.screenshot(path=str(ROOT.parent/'v18.3-concurrent-mobile.png'))
 blocked.close()
 page=open_page(context)
 page.get_by_role('button',name='LET’S PLAY').click()
 page.locator('#guess').wait_for(timeout=7000)
 page.wait_for_timeout(120)
 before=metrics(page)
 assert before['question']['bottom']<before['input']['top'] and before['input']['bottom']<=844,before
 page.screenshot(path=str(ROOT.parent/'v18.3-mobile-play.png'))
 page.evaluate('''()=>{Object.defineProperty(window.visualViewport,'height',{get:()=>460,configurable:true});window.visualViewport.dispatchEvent(new Event('resize'))}''')
 page.wait_for_timeout(150)
 after=metrics(page)
 assert after['keyboard'],after
 for key in ['question','input','limit','direction','submit']:
  assert after[key]['top']>=0 and after[key]['bottom']<=460,(key,after)
 assert after['stageScroll']<=after['stageClient']+1,after
 page.screenshot(path=str(ROOT.parent/'v18.3-mobile-keyboard-space.png'))
 print('Normal viewport:',before)
 print('Keyboard-adjusted viewport:',after)
 # Stress test a long question and a smaller visible area without scrolling.
 page.evaluate("""()=>{document.querySelector('.question-title').textContent='Name a country or territory where the average annual temperature between 1980 and 2000 exceeded 20 degrees Celsius, and where the total forest-covered land declined by at least 10 percent between 2005 and 2020.'; Object.defineProperty(window.visualViewport,'height',{get:()=>345,configurable:true});window.visualViewport.dispatchEvent(new Event('resize'))}""")
 page.wait_for_timeout(150)
 stress=metrics(page)
 print('Long question / 345px:',stress)
 assert stress['question']['bottom']<=345 and stress['submit']['bottom']<=345,stress
 assert stress['stageScroll']<=stress['stageClient']+1,stress
 page.set_viewport_size({'width':320,'height':568})
 page.evaluate("window.visualViewport.dispatchEvent(new Event('resize'))")
 page.wait_for_timeout(140)
 narrow=metrics(page)
 print('Narrow 320px / 345px:',narrow)
 assert narrow['question']['top']>=0 and narrow['question']['bottom']<=345,narrow
 assert narrow['input']['bottom']<=345,narrow
 assert narrow['stageScroll']<=narrow['stageClient']+1,narrow
 page.screenshot(path=str(ROOT.parent/'v18.3-mobile-compact-question.png'))
 print('Blocked tab: custom full-page warning — OK')
 context.close();browser.close()
