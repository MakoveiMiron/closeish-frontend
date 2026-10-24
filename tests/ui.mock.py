"""Browser-only gameplay test without a network/backend (requires Python Playwright).
Chromium launches about:blank; the frontend's scripts are injected, and API methods are mocked.
Run: python tests/ui.mock.py
"""
from pathlib import Path
import json
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
Q=lambda i:{
 'id':f'q{i}', 'date':'2026-10-22','day_number':3, 'topic':'history',
 'prompt':f'Name a historical example for question {i} with a value no greater than 100.',
 'metric':'age','unit':'year','limit':100,'direction':'below','time_limit_seconds':30,
 'score_bands':[{'max_gap_inclusive':0,'points':1200,'tier':'PERFECT HIT'},
                {'max_gap_inclusive':20,'points':1000,'tier':'RAZOR EDGE'},
                {'max_gap_inclusive':40,'points':600,'tier':'SOLID HIT'}],
 'scoring_window':{'max_scoring_distance':50,'units':'year','exact_match_points':1200},
 'input_max_length':115,'source':'https://example.com/','candidate_count':2
}
BOOT={'date':'2026-10-22','timezone':'Europe/Budapest','available':True,'day_number':3,
 'revision':'fb3029da186b169c678ebe8b','published_dates':['2026-10-20','2026-10-21','2026-10-22'],
 'questions':{f'q{i}':Q(i) for i in range(1,7)},'statistics':'postgres'}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1366,'height':900})
 page.goto('about:blank')
 page.clock.install(time=datetime.now(timezone.utc))
 page.on('pageerror',lambda e:print('PAGEERROR',e))
 page.on('console',lambda m:print('CONSOLE',m.text))
 page.set_content('<!doctype html><html><head></head><body><div id="storageNotice" hidden></div><div id="app"></div></body></html>')
 page.add_style_tag(content=(ROOT/'style.css').read_text())
 page.evaluate('''() => {
  const saved=new Map();
  Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)}});
  window.__uuidV4=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`};
  window.__calls={answers:[],completed:0,hints:0};
 }''')
 page.evaluate('''boot => {
  window.CLOSEISH_BOOT=boot;
  window.CLOSEISHApi={playerId:'00000000-0000-4000-8000-000000000001',newUuidV4:window.__uuidV4,storageWarning(){},async post(){return {ok:true}},
   async question(id,action,fields){
    if(action==='hints'){window.__calls.hints++;return {candidates:[]}}
    if(action==='catalogue')return {total:0,offset:0,entries:[]};
    window.__calls.answers.push({id,...fields});
    return {result:{raw:fields.raw,canonical:'',metric_value:null,kind:fields.kind==='answer'?'unlisted':fields.kind,
     points:0,tier:'NO SCORE',autoLocked:fields.automatic,receipt:'signed-'+window.__calls.answers.length}};
   }
  };
  window.CLOSEISHStats={state(){return {loading:false,error:'',pending:false,data:{
     date:'2026-10-22',revision:'fb3029da186b169c678ebe8b',mode:'postgres',total:1,mean:1200,q25:1200,median:1200,q75:1200,
     histogram:Array.from({length:37},(_,i)=>({score:i*200,count:i===6?1:0})),
     official:{score:1200,revision:'fb3029da186b169c678ebe8b',runId:'00000000-0000-4000-8000-000000000001'},
     comparison:{score:1200,others:0,lower:0,equal:0,higher:0,betterThanPercent:null}
    }}},complete(){window.__calls.completed++},refresh(){}};
 }''',BOOT)
 for name in ['view-core.js','community.js','score-chart.js','game.js']:
  page.add_script_tag(content=(ROOT/name).read_text())
 page.locator('#startBtn').click(timeout=3000)
 assert page.locator('#clock').inner_text()=='30s'
 deadline=page.evaluate("JSON.parse(localStorage.getItem('closeish-pending-v1')).activeDeadline")
 assert deadline>0
 # Verify deadline persists when modals are opened/closed.
 page.locator('[data-modal="rules"]').first.click()
 assert page.locator('.modal').count()==1
 page.locator('#closeModal').click()
 assert page.evaluate("JSON.parse(localStorage.getItem('closeish-pending-v1')).activeDeadline")==deadline
 for _ in range(6):
  page.locator('#skipBtn').click()
  page.locator('#nextBtn').wait_for(timeout=5000)
  page.locator('#nextBtn').click()
 page.locator('.end-screen').wait_for()
 assert page.evaluate('window.__calls.answers.length')==6
 assert page.evaluate('window.__calls.completed')>=1
 assert page.locator('.run-answers .book-launch').count()==6
 page.locator('[data-open-book="0"]').click()
 page.locator('.run-answers .catalogue-question').wait_for()
 page.locator('[data-rows="0"]').wait_for(state='attached')
 page.locator('#bookBack').click()
 assert page.locator('#replayBtn').count()==0
 assert page.get_by_text('REPLAY DAY').count()==0
 assert page.evaluate("localStorage.getItem('closeish-pending-v1')") is None
 assert page.locator('.end-score').is_visible()
 assert page.locator('[data-exact-counts]').count()==1
 assert page.locator('.end-screen .exact-count-table').count()==0
 page.locator('[data-exact-counts]').click()
 assert page.get_by_role('dialog',name='DAILY SCORE COUNTS').count()==1
 assert page.locator('.modal-stats .exact-count-table tbody tr').count()==37
 assert page.locator('.modal-stats .exact-count-table').count()>=2
 assert page.locator('.modal-stats .exact-count-scroll').count()==0
 assert page.locator('.modal-stats').evaluate('(e)=>e.scrollHeight<=e.clientHeight')
 page.keyboard.press('Escape')
 assert page.get_by_role('dialog').count()==0
 page.locator('[data-modal="rules"]').first.click()
 assert page.get_by_text('Eligibility comes first').count()==0
 page.locator('#closeModal').click()
 assert page.locator('.footer').inner_text().endswith('Wildly specific limits. Free-text answers. No ads.')
 heights=page.locator('.run-summary .btnrow .cta').evaluate_all('(els)=>els.map(e=>Math.round(e.getBoundingClientRect().height))')
 assert len(heights)==2 and len(set(heights))==1, heights
 page.locator('#homeBtn').click()
 assert page.locator('.end-screen').count()==1
 assert page.locator('.run-summary .result-sync-ok').count()==0
 assert page.locator('#startBtn').count()==0
 assert page.evaluate('window.__calls.answers.length')==6
 print(json.dumps({'passed':True,'sixSkippedAndSigned':True,'catalogueAfterCompletion':True,
                   'timerDeadlinePersisted':True,'replayRemoved':True,'modal37ExactCounts':True,
                   'rulesShortened':True,'buttonsSameHeight':True,'completedDayLocked':True},indent=2))
 browser.close()
