"""Offline browser test for past-day calendar and score chart (Chromium installed at /usr/bin/chromium)."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OLD='2026-10-23';TODAY='2026-10-25';REV='fb3029da186b169c678ebe8b'
PLAYER='00000000-0000-4000-8000-000000000001';RUN='00000000-0000-4000-8000-000000000002'
QUESTIONS={f'q{i}':{'id':f'past_q{i}','date':OLD,'day_number':1,'topic':'history','prompt':f'Question {i}',
 'metric':'year','unit':'year','limit':100,'direction':'below','time_limit_seconds':30,
 'score_bands':[{'max_gap_inclusive':0,'points':1200,'tier':'PERFECT HIT'},{'max_gap_inclusive':100,'points':200,'tier':'ON THE BOARD'}],
 'scoring_window':{'max_scoring_distance':100,'units':'year','exact_match_points':1200},'input_max_length':115,'source':'https://example.com/',
 'candidate_count':1} for i in range(1,7)}
BOOT={'date':OLD,'current_date':TODAY,'timezone':'Europe/Budapest','day_number':1,'available':True,
 'statistics':'postgres','published_dates':['2026-10-23','2026-10-24',TODAY], 'revision':REV,'questions':QUESTIONS}
HIST=[{'score':i*200,'count':1 if i==0 else 0} for i in range(37)]
STATS={'date':OLD,'revision':REV,'mode':'postgres','total':1,'mean':0,'median':0,'q25':0,'q75':0,
 'histogram':HIST,'official':{'revision':REV,'score':0,'runId':RUN},'comparison':{'betterThanPercent':None,'others':0}}
def page_for(browser,completed=False):
 page=browser.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda error: errors.append(str(error)))
 page.goto('about:blank');page.set_content('<!doctype html><html><head></head><body><div id="storageNotice" hidden></div><div id="app"></div></body></html>')
 page.add_style_tag(content=(ROOT/'style.css').read_text())
 remote={'counted':completed,'progress':{'date':OLD,'revision':REV,'runId':RUN,
   'responses':[{'kind':'skipped','raw':'','points':0,'receipt':'signed'} for _ in range(6)],'completed':True,
   'phase':'end'} if completed else None,'days':[],'month':'2026-10','officialScore':0}
 page.evaluate('''({boot,remote,player,run,stats})=>{
  const map=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}});
  window.CLOSEISH_BOOT=boot;window.CLOSEISH_REMOTE_PROGRESS=remote;window.__counts={statistics:0,answers:0};
  window.CLOSEISHApi={playerId:player,newUuidV4:()=>run,storageWarning(){},
   async post(path){if(path==='/api/v1/statistics'){window.__counts.statistics++;return {statistics:stats}}if(path==='/api/v1/progress/start')return {progress:{}};if(path==='/api/v1/results')return {statistics:stats};throw new Error(path)},
   async question(id,action,fields){if(action==='hints')return {candidates:[]};if(action==='catalogue')return {total:0,entries:[]};
     if(action==='answer'){window.__counts.answers++;return {result:{kind:'skipped',raw:'',canonical:null,points:0,tier:'SKIPPED',receipt:'signed'},counted:window.__counts.answers===6}}
     throw new Error(action)},async getProgress(){return {days:[],month:'2026-10'}}};
 }''',{'boot':BOOT,'remote':remote,'player':PLAYER,'run':RUN,'stats':STATS})
 for src in ('view-core.js','community.js','score-chart.js','statistics-client.js','game.js'):
  page.add_script_tag(content=(ROOT/src).read_text())
 return page,errors
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 try:
  page,errors=page_for(browser)
  assert 'ARCHIVE' in page.locator('.navarchive').inner_text()
  assert 'MY DAYS' not in page.locator('#app').inner_text().upper()
  page.locator('[data-modal="archive"]').first.click()
  assert page.locator('[aria-label="2026-10-22: —"]').is_disabled()
  assert page.locator('[data-day="2026-10-23"]').is_enabled()
  assert page.locator('[data-day="2026-10-24"]').is_enabled()
  assert page.locator('[data-day="2026-10-25"]').is_enabled()
  assert page.locator('[aria-label="2026-10-26: FUTURE"]').is_disabled()
  assert 'PLAY' in page.locator('[data-day="2026-10-23"]').inner_text()
  page.locator('#closeModal').click()
  page.locator('#startBtn').click()
  for n in range(6):
   page.locator('#skipBtn').click();page.locator('#nextBtn').wait_for();page.locator('#nextBtn').click()
  page.locator('.end-screen .mock-stat-card svg').first.wait_for()
  assert page.evaluate('window.__counts')=={'statistics':1,'answers':6}
  page.locator('[data-modal="archive"]').first.click()
  assert 'DONE' in page.locator('[data-day="2026-10-23"]').inner_text()
  assert page.locator('[data-day="2026-10-24"]').is_enabled()
  page.locator('#closeModal').click()
  assert not errors,errors
  page.close()
  done,errors=page_for(browser,completed=True)
  done.locator('.end-screen .mock-stat-card svg').first.wait_for()
  assert done.evaluate('window.__counts.statistics')==1
  done.locator('[data-modal="archive"]').first.click()
  assert 'DONE' in done.locator('[data-day="2026-10-23"]').inner_text()
  assert not errors,errors
  print(json.dumps({'passed':True,'publishedPastDaysEnabled':True,'futureDaysDisabled':True,
    'oldDaySixRoundCompletion':True,'completedDayLockedInCalendar':True,'chartOnceOnEndAndReload':True},indent=2))
  done.close()
 finally:browser.close()
