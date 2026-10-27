"""Chart should be fetched exactly once when end screen first appears, or on reload of a solved day.
Run: python tests/chart-snapshot.browser.py  (requires Playwright and Chromium)
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
REVISION='fb3029da186b169c678ebe8b'
PLAYER='00000000-0000-4000-8000-000000000001'
RUN='00000000-0000-4000-8000-000000000002'
DATE='2026-10-22'
QUESTIONS={f'q{i}':{'id':f'q{i}','date':DATE,'day_number':3,'topic':'history','prompt':f'Test question {i}',
  'metric':'year','unit':'year','limit':100,'direction':'below','time_limit_seconds':30,
  'score_bands':[{'max_gap_inclusive':0,'points':1200,'tier':'PERFECT HIT'},{'max_gap_inclusive':100,'points':200,'tier':'ON THE BOARD'}],
  'scoring_window':{'max_scoring_distance':100,'units':'year','exact_match_points':1200},
  'input_max_length':115,'source':'https://example.com/','candidate_count':1} for i in range(1,7)}
BOOT={'date':DATE,'timezone':'Europe/Budapest','day_number':3,'available':True,'statistics':'postgres',
 'published_dates':[DATE],'revision':REVISION,'questions':QUESTIONS}
RESULT={'date':DATE,'revision':REVISION,'mode':'postgres','total':6,'mean':1900,'median':1600,'q25':1200,'q75':2200,
 'histogram':[{'score':score,'count':1} for score in [0,600,1200,1800,2400,3600]],
 'official':{'revision':REVISION,'score':1000,'runId':RUN},
 'comparison':{'betterThanPercent':40.0,'others':5}}
RESPONSES=[{'raw':'Test answer','canonical':'Test answer','kind':'scored','points':200,'receipt':f'signed-{i}'} for i in range(6)]


def run_case(browser,completed,legacy=False):
 page=browser.new_page(viewport={'width':1366,'height':900})
 errors=[]
 page.on('pageerror', lambda error: errors.append(str(error)))
 page.goto('about:blank')
 page.clock.install()
 page.set_content('<!doctype html><html><head></head><body><div id="storageNotice" hidden></div><div id="app"></div></body></html>')
 page.add_style_tag(content=(ROOT/'style.css').read_text())
 progress={'date':DATE,'revision':REVISION,'runId':RUN,'completed':completed,
  'responses':RESPONSES if completed else RESPONSES[:5]}
 if not completed:
  progress.update({'phase':'reveal','lastRound':4})
 remote={'counted':completed,'progress':None if legacy else progress,'officialScore':1000,'days':[], 'month':'2026-10'}
 page.evaluate('''({boot,remote,result,player,run})=>{
  const map=new Map();
  Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}});
  window.CLOSEISH_BOOT=boot; window.CLOSEISH_REMOTE_PROGRESS=remote;
  window.__counts={statistics:0,results:0,events:0};
  window.addEventListener('closeish-statistics',()=>window.__counts.events++);
  window.CLOSEISHApi={playerId:player,newUuidV4:()=>run,storageWarning(){},
    async post(path){
     if(path==='/api/v1/statistics'){window.__counts.statistics++;return {statistics:result}}
     if(path==='/api/v1/results'){window.__counts.results++;return {statistics:result}}
     if(path==='/api/v1/progress/start')return {ok:true};
     throw new Error('Unexpected request: '+path);
    },
    async question(id,action,fields){
     if(action==='hints')return {candidates:[]};
     if(action==='catalogue')return {total:0,entries:[]};
     if(action==='answer')return {result:{raw:'',canonical:'',kind:'skipped',points:0,receipt:'signed-5'},counted:true};
     throw new Error('Unexpected question action '+action);
    },
    async getProgress(){return {days:[],month:'2026-10'}}
  };
 }''',{'boot':BOOT,'remote':remote,'result':RESULT,'player':PLAYER,'run':RUN})
 for name in ('view-core.js','community.js','score-chart.js','statistics-client.js','game.js'):
  page.add_script_tag(content=(ROOT/name).read_text())
 if not completed:
  assert page.locator('.reveal').count()==1
  assert page.evaluate('window.__counts.statistics')==0, 'Do not fetch statistics on the sixth reveal yet'
  page.locator('#nextBtn').click()  # Next round -> last question
  page.locator('#skipBtn').click()
  page.locator('#nextBtn').wait_for()
  assert page.evaluate('window.__counts.statistics')==0, 'Do not fetch before the end screen appears'
  page.locator('#nextBtn').click()  # Now user first sees the end screen
 page.locator('.end-screen .mock-stat-card svg').first.wait_for()
 before=page.evaluate('''() => {
  window.__chartNode=document.querySelector('.end-screen .mock-chart');
  return {...window.__counts};
 }''')
 assert before['statistics']==1,(completed,legacy,before)
 assert before['events']==1,(completed,legacy,before)
 page.locator('[data-modal="rules"]').first.click()
 assert page.get_by_role('dialog',name='HOW TO PLAY').count()==1
 page.locator('#closeModal').click()
 page.locator('[data-exact-counts]').click()
 assert page.get_by_role('dialog',name='DAILY SCORE BANDS').count()==1
 page.locator('#closeModal').click()
 page.locator('[data-modal="archive"]').first.click()
 page.locator('#closeModal').click()
 page.locator('#homeBtn').click()
 assert page.evaluate('document.querySelector(".end-screen .mock-chart")===window.__chartNode'), 'Chart SVG node must not be replaced on UI renders'
 page.evaluate("document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));")
 page.clock.fast_forward(125_000)
 page.wait_for_timeout(100)
 after=page.evaluate('window.__counts')
 assert after==before,(completed,before,after)
 assert not errors,errors
 page.close()
 return after

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 try:
  solved=run_case(browser,True)
  fresh=run_case(browser,False)
  legacy=run_case(browser,True,legacy=True)
  print(json.dumps({'passed':True,'alreadySolvedOnPageLoad':solved,'firstEndScreen':fresh,'legacySolvedWithoutBreakdown':legacy,
   'noFetchOnSixthRoundReveal':True,'noRefreshAfterVisibilityOrTimer':True,'preservedSVGAcrossModals':True},indent=2))
 finally:
  browser.close()
