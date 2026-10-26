"""Static visual-viewport regression test. Run: python tests/viewport-fit.browser.py

Requires Playwright and Chromium. Runs offline; does not call the production API.
Exercises intro, post-game result layout and the phone PLAY exemption.
"""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HTML=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '',(ROOT/'index.html').read_text())
HTML=re.sub(r'<script[^>]*></script>|<link[^>]+>', '',HTML)
CSS=(ROOT/'style.css').read_text()
FIT=(ROOT/'desktop-viewport.js').read_text()
SIZES=[(2560,1440),(1920,1080),(1600,900),(1366,768),(1280,720),
       (1024,768),(768,1024),(390,844),(360,740),(320,568)]

def result(p):
 return p.evaluate('''()=>({
   width:document.documentElement.scrollWidth,
   height:document.documentElement.scrollHeight,
   zoom:Number(document.querySelector('#app').style.zoom||1)
 })''')

with sync_playwright() as playwright:
 browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in SIZES:
  page=browser.new_page(viewport={'width':width,'height':height})
  page.set_content(HTML,wait_until='domcontentloaded')
  page.add_style_tag(content=CSS)
  page.add_script_tag(content=FIT)
  page.wait_for_timeout(120)
  initial=result(page)
  assert initial['width']<=width+1,(width,height,'intro width',initial)
  assert initial['height']<=height+1,(width,height,'intro height',initial)
  assert .30<=initial['zoom']<=1,('intro zoom',initial)
  if width==1920 and height==1080:assert initial['zoom']==1,initial
  page.evaluate('''()=>{
   const game=document.querySelector('#gameArea');
   game.innerHTML=document.querySelector('.restore-results-shell .end-screen').outerHTML;
   document.body.className='edge-run edge-ended';
  }''')
  page.wait_for_timeout(120)
  ended=result(page)
  assert ended['width']<=width+1,(width,height,'ended width',ended)
  assert ended['height']<=height+1,(width,height,'ended height',ended)
  if width<=700:
   page.evaluate("document.body.className='edge-run edge-playing'")
   page.wait_for_timeout(80)
   playing=result(page)
   assert playing['zoom']==1,(width,height,'phone game zoom must be unchanged',playing)
  print(f'{width}x{height}: intro {initial["zoom"]:.3f}, end {ended["zoom"]:.3f} — OK')
  page.close()
 browser.close()
