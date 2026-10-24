"""V18.4: responsive score distribution and silent successful save. Chromium and Playwright."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
D='2026-10-24';REV='abc123';PID='00000000-0000-4000-8000-000000000001';RUN='00000000-0000-4000-8000-000000000002'
QS={f'q{i}':{'id':f'q{i}','date':D,'day_number':2,'topic':'science','prompt':'Test question', 'limit':100, 'direction':'below','unit':'km', 'time_limit_seconds':30, 'score_bands':[], 'scoring_window':{'max_scoring_distance':20,'units':'km'},'candidate_count':2} for i in range(1,7)}
BOOT={'date':D,'timezone':'Europe/Budapest','day_number':2,'current_date':D,'available':True,'statistics':'postgres','published_dates':[D],'revision':REV,'questions':QS}
RESULT={'date':D,'revision':REV,'mode':'postgres','total':150000,'mean':1300,'median':1400,'q25':600,'q75':2400,'histogram':[{'score':i*200,'count':123456 if i==6 else i} for i in range(37)],'official':{'score':1200,'revision':REV,'runId':RUN},'comparison':{'betterThanPercent':50,'others':149999}}
PROGRESS={'date':D,'revision':REV,'runId':RUN,'completed':True,'responses':[{'raw':'test','canonical':'test','kind':'scored','points':200,'receipt':f'x{i}'} for i in range(6)]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for w,h in [(1725,862),(1366,768),(768,650),(390,844),(375,667),(320,568),(844,390),(320,400)]:
  page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="storageNotice" hidden></div><div id="app"></div></body></html>')
  page.add_style_tag(content=(ROOT/'style.css').read_text())
  page.evaluate('''({boot,result,progress,pid,run})=>{
   const map=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}});
   window.CLOSEISH_BOOT=boot;window.CLOSEISH_REMOTE_PROGRESS={counted:true,progress,officialScore:1200,days:[],month:'2026-10'};
   window.CLOSEISHApi={playerId:pid,newUuidV4:()=>run,storageWarning(){},async post(path){return {statistics:result}},async getProgress(){return {month:'2026-10',days:[]}}};
  }''',{'boot':BOOT,'result':RESULT,'progress':PROGRESS,'pid':PID,'run':RUN})
  # Avoid async snapshot: render exactly the returned histogram from the backend.
  page.evaluate('''result=>{window.CLOSEISHStats={state(){return {pending:false,error:'',loading:false,data:result}},verifyCompletion(){},complete(){}}}''',RESULT)
  for script in ['view-core.js','community.js','score-chart.js','game.js']:
   page.add_script_tag(content=(ROOT/script).read_text())
  assert page.locator('.end-screen').count()==1,(w,h)
  assert page.locator('.run-summary .result-sync').count()==0,(w,h)
  page.locator('[data-exact-counts]').click()
  assert page.locator('.modal-stats .exact-count-table tbody tr').count()==37,(w,h)
  assert page.locator('.exact-count-scroll').count()==0
  metrics=page.evaluate('''() => {let modal=document.querySelector('.modal-stats'), tables=[...document.querySelectorAll('.exact-count-table')],bounds=modal.getBoundingClientRect();return {modalTop:bounds.top,modalBottom:bounds.bottom,modalScroll:modal.scrollHeight,modalHeight:modal.clientHeight,cols:tables.length,rows:tables.map(t=>t.rows.length-1),maxRight:Math.max(...tables.map(t=>t.getBoundingClientRect().right)),maxBottom:Math.max(...tables.map(t=>t.getBoundingClientRect().bottom)),minLeft:Math.min(...tables.map(t=>t.getBoundingClientRect().left)),viewportWidth:innerWidth,viewportHeight:innerHeight}}''')
  assert not errors,(w,h,errors)
  assert metrics['modalScroll']<=metrics['modalHeight']+1,(w,h,metrics)
  assert metrics['modalTop']>=-1 and metrics['modalBottom']<=h+1,(w,h,metrics)
  assert metrics['maxBottom']<=metrics['modalBottom']+1,(w,h,metrics)
  assert metrics['minLeft']>=0 and metrics['maxRight']<=w+1,(w,h,metrics)
  if (w,h) in [(1725,862),(320,568)]:
   page.screenshot(path=f'/mnt/data/closeish-v18.4-build/scores-{w}x{h}.png')
  print('PASS',w,h,metrics)
  page.close()
 browser.close()
