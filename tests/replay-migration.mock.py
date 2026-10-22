"""Verify that users who replayed in V17.3 get their first completed run back."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
old_revision='aaaaaaaaaaaaaaaaaaaaaaaa'
current_revision='bbbbbbbbbbbbbbbbbbbbbbbb'
original={'date':'2026-10-22','revision':old_revision,'runId':'a1234567-1234-4123-8123-123456789012',
          'responses':[{'raw':'A','points':200,'receipt':'signed-'+str(i)} for i in range(6)],
          'completed':True}
practice={'date':'2026-10-22','revision':current_revision,'runId':'b1234567-1234-4123-8123-123456789012',
          'responses':[],'completed':False,'practice':True}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page()
 page.goto('about:blank')
 page.on('pageerror',lambda e:print('PAGEERROR',e))
 page.set_content('<html><head></head><body><div id="storageNotice" hidden></div><div id="app"></div></body></html>')
 page.evaluate('''(records) => {
 const saved=new Map(Object.entries(records));
 Object.defineProperty(window,'localStorage',{configurable:true,value:{
 getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)}});
 window.CLOSEISH_BOOT={date:'2026-10-22',day_number:3,available:true,revision:'bbbbbbbbbbbbbbbbbbbbbbbb',
 timezone:'Europe/Budapest',published_dates:['2026-10-22'],questions:Object.fromEntries(
 Array.from({length:6},(_,i)=>['q'+(i+1),{id:'q'+(i+1),prompt:'A question',topic:'science',metric:'units',direction:'below',limit:100,time_limit_seconds:30}]))};
 window.CLOSEISHApi={newUuidV4(){return 'c1234567-1234-4123-8123-123456789012'},storageWarning(){}};
 window.CLOSEISHStats={state(){return {}},complete(){window.__completions=(window.__completions||0)+1},refresh(){}};
 }''',{'closeish-progress-v2':__import__('json').dumps({'2026-10-22':practice}),
       'closeish-first-completed-v1':__import__('json').dumps({'2026-10-22':original})})
 for script in ['view-core.js','community.js','score-chart.js','game.js']:
  page.add_script_tag(content=(ROOT/script).read_text())
 assert page.locator('.end-screen').count()==1
 assert page.locator('#startBtn').count()==0
 saved=page.evaluate("JSON.parse(localStorage.getItem('closeish-progress-v2'))['2026-10-22']")
 assert saved['runId']==original['runId']
 assert saved['revision']==old_revision, saved['revision']
 assert saved['completed'] is True
 print('replay-migration OK; first run preserved, old receipt revision preserved')
 browser.close()
