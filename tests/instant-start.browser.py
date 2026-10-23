"""CLOSEISH V17.9 instant landing / deferred play / real 404 / API failure.

Runs against the bundled static server without the production API:
    python tests/instant-start.browser.py
"""
import subprocess
import time
import json
import os
import re
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:5187'
# Sandboxed Chromium cannot navigate to local sockets; inject the same checked-in
# static HTML/CSS/JS into about:blank, and separately test HTTP status with urllib.
HTML=re.sub(r'<script\b[^>]*>.*?</script>|<link\b[^>]*>|<meta\s+http-equiv="Content-Security-Policy"[^>]*>','',(ROOT/'index.html').read_text(),flags=re.I|re.S)
ASSETS={name:(ROOT/name).read_text() for name in ['view-core.js','community.js','score-chart.js','statistics-client.js','game.js']}
QUESTION=lambda i: {
  'id':f'q{i}', 'date':'2026-10-23','day_number':1, 'topic':'history',
  'prompt':f'Name a historic place for round {i} with at most 100 units.',
  'metric':'age','unit':'year','limit':100,'direction':'below','time_limit_seconds':30,
  'score_bands':[{'max_gap_inclusive':0,'points':1200,'tier':'PERFECT HIT'},
                 {'max_gap_inclusive':20,'points':1000,'tier':'RAZOR EDGE'},
                 {'max_gap_inclusive':40,'points':600,'tier':'SOLID HIT'}],
  'scoring_window':{'max_scoring_distance':50,'units':'year','exact_match_points':1200},
  'input_max_length':115,'source':'https://example.org/','candidate_count':2
}
TODAY={
 'date':'2026-10-23','current_date':'2026-10-23','timezone':'Europe/Budapest','available':True,
 'day_number':1,'revision':'abc123','published_dates':['2026-10-23'],
 'questions':{f'q{i}':QUESTION(i) for i in range(1,7)},'statistics':'postgres'
}
PROGRESS={'month':'2026-10','days':[],'progress':None,'counted':False}
MOCK_FETCH="""() => {
  window.__pendingApi=[];
  window.fetch=(url,options)=>new Promise((resolve,reject)=>{
    window.__pendingApi.push({url:String(url),resolve,reject,options});
  });
  window.__respond=(fragment,body)=>{
    const request=window.__pendingApi.find(r=>r.url.includes(fragment));
    if(!request)throw new Error('Missing pending request '+fragment);
    window.__pendingApi=window.__pendingApi.filter(r=>r!==request);
    request.resolve(new Response(JSON.stringify(body),{
      status:200,headers:{'Content-Type':'application/json'}
    }));
  };
  window.__failApi=()=>{
    for(const r of window.__pendingApi)r.reject(new Error('offline'));
    window.__pendingApi=[];
  };
}"""

def open_static_page(context):
 page=context.new_page()
 page.goto('about:blank')
 page.set_content(HTML)
 page.add_style_tag(content=(ROOT/'style.css').read_text())
 # Dynamic script load order is preserved; no external HTTP used in Chromium.
 page.evaluate('''assets=>{
   window.__assets=assets;
   window.CLOSEISH_CONFIG={apiBase:'https://closeish-production.up.railway.app',apiKey:''};
   const append=document.head.appendChild.bind(document.head);
   document.head.appendChild=node=>{
     if(node.tagName==='SCRIPT'&&node.src){
       queueMicrotask(()=>{
         const pathname=node.src.split("?")[0];
         try{(0,eval)(window.__assets[pathname.slice(1)]);node.onload?.()}
         catch(err){node.onerror?.(err);throw err}
       });
       return node;
     }
     return append(node);
   };
 }''',ASSETS)
 page.evaluate(MOCK_FETCH)
 page.add_script_tag(content=(ROOT/'api.js').read_text())
 return page

def await_two(page):
 page.wait_for_function("window.__pendingApi?.filter(r=>r.url.includes('/api/v1/')).length===2",timeout=7000)

def reply(page):
 page.evaluate('(value)=>window.__respond("/api/v1/today",value)',TODAY)
 page.evaluate('(value)=>window.__respond("/api/v1/progress",value)',PROGRESS)

env=dict(os.environ,WEB_PORT='5187',WEB_HOST='127.0.0.1')
server=subprocess.Popen(['node','scripts/dev.mjs'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,env=env)
try:
 for i in range(30):
  try:
   with urlopen(URL+'/favicon.svg',timeout=1) as r:
    assert r.status==200 and r.headers['Content-Type']=='image/svg+xml'
   break
  except Exception:
   time.sleep(.1)
 else: raise AssertionError('dev server did not start')
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for name,viewport in [('desktop',{'width':1366,'height':900}),('mobile',{'width':390,'height':844})]:
   context=browser.new_context(viewport=viewport)
   page=open_static_page(context)
   errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   await_two(page)
   assert page.get_by_role('heading',name='HOW CLOSE CAN YOU GET?').is_visible()
   assert page.get_by_role('button',name='LET’S PLAY').is_visible()
   assert not page.locator('#bootScreen').count()
   assert page.locator('#clock').count()==0
   assert page.locator('.launch-guide').is_visible()
   page.screenshot(path=str(ROOT.parent/f'{name}-instant-landing.png'),full_page=True)
   page.locator('#startBtn').click()
   assert page.locator('#startBtn').is_disabled()
   assert 'Preparing your challenge' in page.locator('#bootStatus').inner_text()
   assert page.locator('#clock').count()==0
   reply(page)
   page.locator('#clock').wait_for(timeout=7000)
   assert page.locator('#clock').inner_text()=='30s'
   assert page.locator('#guess').count()==1
   assert page.locator('#startBtn').count()==0
   assert not errors,errors
   page.screenshot(path=str(ROOT.parent/f'{name}-instant-play.png'),full_page=True)
   print(name+': immediate intro, queued play, timer starts after real question — OK')
   context.close()
  # No premature round: if the visitor does not press Play, the hydrated page
  # remains an intro even though both API calls have already completed.
  context=browser.new_context()
  page=open_static_page(context);await_two(page);reply(page)
  page.get_by_role('button',name='LET’S PLAY').wait_for(timeout=7000)
  assert page.locator('#clock').count()==0
  assert '#001' in page.locator('.start-kicker').inner_text()
  context.close()
  # Menu interactions before the network response are also preserved.
  context=browser.new_context()
  page=open_static_page(context);await_two(page)
  page.locator('nav [data-modal="rules"]').click()
  reply(page)
  page.get_by_role('dialog',name='HOW TO PLAY').wait_for(timeout=7000)
  context.close()
  # Confirmed historical completions never get a replay merely because Play
  # was pressed while the progress request was still pending.
  context=browser.new_context()
  page=open_static_page(context);await_two(page)
  page.locator('#startBtn').click()
  page.evaluate('(value)=>window.__respond("/api/v1/today",value)',TODAY)
  page.evaluate('(value)=>window.__respond("/api/v1/progress",value)',{**PROGRESS,'counted':True,'officialScore':4200})
  page.locator('.end-screen').wait_for(timeout=7000)
  assert page.locator('#clock').count()==0
  assert page.locator('#startBtn').count()==0
  context.close()
  print('No automatic start, queued modal and replay lock — OK')
  # API/network failure leaves the home design intact and provides a real retry.
  context=browser.new_context()
  page=open_static_page(context)
  await_two(page)
  page.evaluate('window.__failApi()')
  page.get_by_role('button',name='TRY AGAIN').wait_for(timeout=7000)
  assert page.locator('.hero').is_visible()
  assert page.locator('.startup-status.boot-error').is_visible()
  assert page.locator('#startBtn').is_hidden()
  context.close()
  # Missing file receives HTML design and true HTTP 404 (no redirect to /).
  with urlopen(URL+'/500.html',timeout=3) as r:
   assert r.status==200 and 'EVEN THE SERVER' in r.read().decode()
  try:urlopen(URL+'/this-route-is-missing',timeout=3)
  except HTTPError as e:
   assert e.code==404
   assert e.headers.get_content_type()=='text/html'
   assert 'THIS PAGE' in e.read().decode()
  else:raise AssertionError('missing route should be a real 404')
  print('API failure, real HTTP 404 and fallback error page — OK')
  # Inspect real 404 template in a browser (static document with shared CSS).
  context=browser.new_context(viewport={'width':390,'height':844})
  page=context.new_page();page.goto('about:blank')
  page.set_content(re.sub(r'<link\b[^>]*>','',(ROOT/'404.html').read_text(),flags=re.I))
  page.add_style_tag(content=(ROOT/'style.css').read_text())
  assert page.get_by_role('heading',name='THIS PAGE IS OUT OF BOUNDS.').is_visible()
  assert page.get_by_role('link',name='BACK TO THE GAME').get_attribute('href')=='/'
  page.screenshot(path=str(ROOT.parent/'mobile-404.png'),full_page=True)
  context.close()
  browser.close()
finally:
 server.terminate()
 try:server.wait(timeout=5)
 except subprocess.TimeoutExpired:server.kill()
