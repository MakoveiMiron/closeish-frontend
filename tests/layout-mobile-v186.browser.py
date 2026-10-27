"""CLOSEISH mobile and smaller-desktop layout regression using mocked API.
No backend/network dependency. Run: python tests/layout-mobile-v186.browser.py
"""
from pathlib import Path
import json, sys
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
Q=lambda i:{
 'id':f'q{i}', 'date':'2026-10-27','day_number':8, 'topic':'history',
 'prompt':f'Name a famous historical figure or event whose year is at most 1900 for question {i}; get as close to 1900 as you can without crossing the limit.',
 'metric':'year','unit':'year','limit':1900,'direction':'below','time_limit_seconds':30,
 'score_bands':[{'max_gap_inclusive':0,'points':1200,'tier':'PERFECT HIT'},
                {'max_gap_inclusive':20,'points':1000,'tier':'RAZOR EDGE'},
                {'max_gap_inclusive':40,'points':600,'tier':'SOLID HIT'}],
 'scoring_window':{'max_scoring_distance':50,'units':'year','exact_match_points':1200},
 'input_max_length':115,'source':'https://example.com/','candidate_count':2
}
BOOT={'date':'2026-10-27','current_date':'2026-10-27','timezone':'Europe/Budapest','available':True,'day_number':8,
 'revision':'fb3029da186b169c678ebe8b','published_dates':[f'2026-10-{d:02d}' for d in range(20,28)],
 'questions':{f'q{i}':Q(i) for i in range(1,7)},'statistics':'postgres'}
def set_up(browser,w,h):
 page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
 page.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="storageNotice" hidden></div><div id="app"></div></body></html>')
 page.add_style_tag(content=(ROOT/'style.css').read_text())
 page.evaluate('''() => {
  const saved=new Map();
  Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)}});
  window.__uuidV4=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`};
  window.__calls={answers:[],completed:0};
 }''')
 page.evaluate('''boot => {
  window.CLOSEISH_BOOT=boot;
  window.CLOSEISHApi={playerId:'00000000-0000-4000-8000-000000000001',newUuidV4:window.__uuidV4,storageWarning(){},async post(){return {ok:true}},
   async question(id,action,fields){if(action==='hints')return {candidates:[]};if(action==='catalogue')return {total:0,offset:0,entries:[]};
    window.__calls.answers.push({id,...fields});return {result:{raw:fields.raw,canonical:'',metric_value:null,kind:'unlisted',points:0,tier:'NO SCORE',autoLocked:fields.automatic,receipt:'signed-'+window.__calls.answers.length}};
   }};
  window.CLOSEISHStats={state(){return {loading:false,error:'',pending:false,data:{date:'2026-10-27',revision:'fb3029da186b169c678ebe8b',mode:'postgres',total:1,mean:1200,q25:1200,median:1200,q75:1200,
   histogram:Array.from({length:37},(_,i)=>({score:i*200,count:i===6?1:0})),official:{score:1200,revision:'fb3029da186b169c678ebe8b',runId:'00000000-0000-4000-8000-000000000001'},comparison:{score:1200,others:0,lower:0,equal:0,higher:0,betterThanPercent:null}}}},complete(){window.__calls.completed++},refresh(){}};
 }''',BOOT)
 for name in ['mobile-viewport.js','desktop-viewport.js','dialog-viewport.js','view-core.js','community.js','score-chart.js','game.js']:
  page.add_script_tag(content=(ROOT/name).read_text())
 page.wait_for_timeout(35)
 return page

def geometry(page):
 return page.evaluate('''() => {const el=s=>{let n=document.querySelector(s); if(!n)return null;let r=n.getBoundingClientRect();return {h:Math.round(r.height),w:Math.round(r.width),top:Math.round(r.top),bottom:Math.round(r.bottom),scroll:n.scrollHeight,client:n.clientHeight}};
 return {body:document.body.className,window:[innerWidth,innerHeight],zoom:document.querySelector('#app')?.style.zoom,
 page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],card:el('#gameArea'),modal:el('.modal'),
 modalHead:el('.modalhead'),modalContent:el('.modalcontent'), main:el('.content'),tab:el('.end-mobile-tabs'),
 result:el('.end-dashboard'),intro:el('.start-screen'),hero:el('.hero'),footer:el('.footer'),active:el('body[data-closeish-end-tab] .end-dashboard > section:not([style*=none])')}; }''')
def check(page,label,screenshot=False):
 page.wait_for_timeout(50)
 v=geometry(page);w,h=v['window']; modal=v['modal']
 if modal:
  ok=modal['bottom']<=h+2 and modal['top']>=-2 and modal['scroll']<=modal['client']+2
 else:ok=v['page'][0]<=w+2 and v['page'][1]<=h+2
 if screenshot:
  out=ROOT.parents[0]/'layout-shots';out.mkdir(exist_ok=True)
  page.screenshot(path=str(out/f'{label}.png'))
 print(json.dumps({'test':label,'ok':ok, **v},ensure_ascii=False))
 if not ok: raise AssertionError(f'{label}: overflow')
 return v
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for w,h in [(390,844),(375,667),(320,568),(430,932),(768,1024),(800,600),(1024,600),(1280,720),(1366,768),(1920,1080)]:
  page=set_up(browser,w,h)
  label=f'{w}x{h}'
  check(page,f'intro-{label}',screenshot=w in (390,320,1024))
  # dialog screens during intro
  for kind in ('rules','archive','suggest'):
   page.locator(f'.mainnav [data-modal="{kind}"]').click()
   check(page,f'{kind}-{label}',screenshot=w in (390,320,1024))
   page.locator('#closeModal').click()
  if w<=700:
   page.locator('#startBtn').click()
   check(page,f'play-{label}',screenshot=w in (390,320))
   for i in range(6):
    page.locator('#skipBtn').click()
    page.locator('#nextBtn').wait_for(timeout=5000)
    if i==0:check(page,f'reveal-{label}',screenshot=w in (390,320))
    page.locator('#nextBtn').click()
   page.locator('.end-screen').wait_for()
   check(page,f'end-summary-{label}',screenshot=w in (390,320))
   page.locator('[data-mobile-end-tab="stats"]').click()
   check(page,f'end-stats-{label}',screenshot=w in (390,320))
   page.locator('[data-mobile-end-tab="answers"]').click()
   check(page,f'end-answers-{label}',screenshot=w in (390,320))
   page.locator('[data-open-book="0"]').click()
   check(page,f'end-catalogue-{label}',screenshot=w in (390,320))
  page.close()
 browser.close()
