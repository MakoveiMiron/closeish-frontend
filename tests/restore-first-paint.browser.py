"""V18.1: verify initial HTML never flashes the intro when restoring a game.

Runs with offline mocked API and Chromium; no production server connection.
"""
from pathlib import Path
import json
import re
import uuid
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RAW=(ROOT/'index.html').read_text()
HTML=re.sub(r'<script\b[^>]*>.*?</script>|<link\b[^>]*>|<meta\s+http-equiv="Content-Security-Policy"[^>]*>','',RAW,flags=re.I|re.S)
GUARD=(ROOT/'startup-guard.js').read_text()
ASSETS={name:(ROOT/name).read_text() for name in ['view-core.js','community.js','score-chart.js','statistics-client.js','game.js']}
API=(ROOT/'api.js').read_text()
TODAY={'date':'2026-10-23','current_date':'2026-10-23','timezone':'Europe/Budapest',
 'available':True,'day_number':1,'revision':'abc123','published_dates':['2026-10-23'],
 'statistics':'postgres',
 'questions':{f'q{i}':{'id':f'q{i}','date':'2026-10-23','day_number':1,'topic':'history',
  'prompt':f'Choose a historical year for round {i}.','metric':'year','unit':'year',
  'direction':'below','limit':2000,'time_limit_seconds':30,
  'score_bands':[{'max_gap_inclusive':0,'points':1200,'tier':'PERFECT HIT'}],
  'scoring_window':{'max_scoring_distance':200,'units':'year','exact_match_points':1200},
  'input_max_length':100,'source':'https://example.org/','candidate_count':0} for i in range(1,7)}}


def browser_page(context, *, player_id=None, marker=None, pending=None):
 page=context.new_page()
 page.goto('about:blank')
 store={}
 if player_id:store['closeish-player-v1']=player_id
 if marker:
  store['closeish-first-screen-v1']=json.dumps({'2026-10-23':marker})
 if pending:
  store['closeish-pending-v1']=json.dumps(pending)
 scripts=f'''<script>
 window.__store=new Map(Object.entries({json.dumps(store)}));
 Object.defineProperty(window,'localStorage',{{value:{{
  getItem:key=>window.__store.get(key)||null,
  setItem:(key,value)=>window.__store.set(key,String(value)),
  removeItem:key=>window.__store.delete(key)
 }}, configurable:true}});
 </script><script>{GUARD}</script>'''
 page.set_content(HTML.replace('<head>','<head>'+scripts,1))
 page.add_style_tag(content=(ROOT/'style.css').read_text())
 page.evaluate('''assets=>{
  window.__assets=assets;
  window.CLOSEISH_CONFIG={apiBase:'https://closeish-production.up.railway.app',apiKey:''};
  window.__requests=[];
  window.fetch=(url,options)=>new Promise((resolve,reject)=>{
    window.__requests.push({url:String(url),resolve,reject});
  });
  window.__respond=(fragment,body)=>{
    const i=window.__requests.findIndex(x=>x.url.includes(fragment));
    if(i<0)throw new Error('No request with '+fragment);
    const [req]=window.__requests.splice(i,1);
    req.resolve(new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}}));
  };
  const append=document.head.appendChild.bind(document.head);
  document.head.appendChild=node=>{
    if(node.tagName==='SCRIPT'&&node.src){queueMicrotask(()=>{
      try{(0,eval)(window.__assets[node.src.split('?')[0].split('/').pop()]);node.onload?.()}
      catch(e){node.onerror?.(e);throw e}
    });return node}
    return append(node);
  };
 }''',ASSETS)
 page.add_script_tag(content=API)
 page.wait_for_function("window.__requests.filter(r=>r.url.includes('/api/v1/')).length===2",timeout=7000)
 return page

def respond(page,remote):
 page.evaluate('(v)=>window.__respond("/api/v1/today",v)',TODAY)
 page.evaluate('(v)=>window.__respond("/api/v1/progress",v)',remote)

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for shape,viewport in [('desktop',{'width':1366,'height':900}),('mobile',{'width':390,'height':844})]:
  context=browser.new_context(viewport=viewport)
  player=str(uuid.uuid4())
  page=browser_page(context,player_id=player,marker='game')
  assert page.locator('html.closeish-restore-wait').count()==1
  assert page.locator('#restoreSplash').is_visible()
  assert not page.locator('#startBtn').is_visible()
  # Deliberately withhold the network response while looking at first paint.
  page.wait_for_timeout(200)
  assert not page.get_by_role('heading',name='HOW CLOSE CAN YOU GET?').is_visible()
  respond(page,{'month':'2026-10','days':[],'progress':None,'counted':True,'officialScore':4200})
  page.locator('.end-screen').wait_for(timeout=7000)
  assert not page.locator('html.closeish-restore-wait').count()
  assert not page.locator('#startBtn').count()
  assert page.get_by_text('ALREADY COMPLETED.').is_visible()
  page.close()

  # Full PostgreSQL transcript takes the normal three-column end dashboard
  # directly, rather than the legacy-completion placeholder.
  confirmed={'date':'2026-10-23','revision':'abc123','runId':str(uuid.uuid4()),
   'responses':[{'kind':'skipped','points':0,'raw':'','receipt':f'proof-{i}'} for i in range(6)],
   'completed':True}
  page=browser_page(context,player_id=player,marker='game')
  assert page.locator('#restoreSplash').is_visible()
  respond(page,{'month':'2026-10','days':[], 'progress':confirmed,'counted':True,'officialScore':0})
  page.locator('.end-screen').wait_for(timeout=7000)
  assert page.locator('.mock-stat-card').count()==1
  assert not page.locator('#startBtn').count()
  assert not page.locator('html.closeish-restore-wait').count()
  page.close()

  # An in-progress run goes straight from loading state to live game.
  run=str(uuid.uuid4())
  pending={'date':'2026-10-23','revision':'abc123','runId':run,'phase':'play',
   'activeRound':0,'activeDeadline':9999999999999}
  page=browser_page(context,player_id=player,pending=pending)
  assert page.locator('#restoreSplash').is_visible()
  assert not page.locator('#startBtn').is_visible()
  respond(page,{'month':'2026-10','days':[],'progress':None,'counted':False})
  page.locator('#clock').wait_for(timeout=7000)
  assert not page.locator('html.closeish-restore-wait').count()
  assert page.locator('#startBtn').count()==0
  assert page.locator('#guess').is_visible()
  page.close()

  # API outage while the returner's state is unknown: stay on the restore
  # surface with a retry, never accidentally offer a new challenge.
  page=browser_page(context,player_id=player,marker='game')
  assert page.locator('#restoreSplash').is_visible()
  page.evaluate('''()=>{
   for(const pending of window.__requests)pending.reject(new Error('offline'));
   window.__requests=[];
  }''')
  page.locator('.restore-error').wait_for(timeout=7000)
  assert page.get_by_role('button',name='TRY AGAIN').is_visible()
  assert not page.locator('#startBtn').is_visible()
  page.close()

  # A legacy player has no V18.1 marker yet: fail closed on the initial paint.
  page=browser_page(context,player_id=player)
  assert page.locator('#restoreSplash').is_visible()
  assert not page.locator('#startBtn').is_visible()
  respond(page,{'month':'2026-10','days':[],'progress':None,'counted':False})
  page.get_by_role('button',name='LET’S PLAY').wait_for(timeout=7000)
  assert not page.locator('html.closeish-restore-wait').count()
  assert json.loads(page.evaluate("localStorage.getItem('closeish-first-screen-v1')"))['2026-10-23']=='intro'
  page.close()

  # Fresh and confirmed-unplayed players retain the original instant landing.
  for marker,uid in [(None,None),('intro',player)]:
   page=browser_page(context,player_id=uid,marker=marker)
   assert not page.locator('html.closeish-restore-wait').count()
   assert page.locator('#startBtn').is_visible()
   assert not page.locator('#restoreSplash').is_visible()
   respond(page,{'month':'2026-10','days':[],'progress':None,'counted':False})
   page.get_by_role('button',name='LET’S PLAY').wait_for(timeout=7000)
   page.close()
  print(f'{shape}: first paint, legacy, in-progress, completed, fresh — OK')
  context.close()
 browser.close()
