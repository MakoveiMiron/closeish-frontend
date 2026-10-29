"""Check the NEXT ROUND action stays visible after skip and timeout-like output.
Run: python tests/round-result-mobile-v189.browser.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve()
# The established mock boots the real app with no backend dependency.
source=(HERE.parent/'layout-mobile-v186.browser.py').read_text().split('with sync_playwright() as p:')[0]
namespace={'__file__':str(HERE.parent/'layout-mobile-v186.browser.py')}
exec(source,namespace)
boot_page=namespace['set_up']

def rect(page,selector):
 return page.eval_on_selector(selector,'e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}')

def check(page,label):
 card=rect(page,'#gameArea')
 action=rect(page,'#nextBtn')
 details=rect(page,'.round-result-details')
 head=rect(page,'.compact-result-title')
 footer=rect(page,'.footer')
 state=page.evaluate('''() => ({innerWidth, innerHeight, scrollWidth:document.documentElement.scrollWidth,
 scrollHeight:document.documentElement.scrollHeight,
 detailsOverflow:document.querySelector('.round-result-details').scrollHeight - document.querySelector('.round-result-details').clientHeight,
 cardOverflow:document.querySelector('#gameArea').scrollHeight - document.querySelector('#gameArea').clientHeight})''')
 assert card['top'] < head['top'] < details['top'] < action['top'] < action['bottom'] <= card['bottom']-4, (label,card,head,details,action)
 assert footer['top']>card['bottom'],(label,footer,card)
 assert state['scrollWidth'] <= state['innerWidth']+1 and state['scrollHeight'] <= state['innerHeight']+1,(label,state)
 assert state['detailsOverflow']<=1 and state['cardOverflow']<=1,(label,state)
 print('PASS',label)

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for w,h in [(320,480),(320,568),(360,540),(360,675),(360,800),(375,667),(390,844),(430,932)]:
  page=boot_page(browser,w,h)
  page.locator('#startBtn').click()
  page.locator('#skipBtn').click()
  check(page,f'skipped {w}x{h}')
  # Substitute the exact types of information in a TIME EXPIRED result.
  page.evaluate('''()=>{document.querySelector('.result-emblem').textContent='✳ TIME EXPIRED';
   document.querySelector('.result-head').textContent='TIME’S UP';
   document.querySelector('.round-result-details').insertAdjacentHTML('beforeend',
    '<div class="compact-meta">The entered answer has no verified numeric value.</div><div class="compact-note note-time">Time expired without a uniquely verified answer. 0 points.</div>');}''')
  check(page,f'timed out {w}x{h}')
  page.evaluate('''()=>{let d=document.querySelector('.round-result-details');
   d.querySelector('.stat-tier strong').textContent='The very unusually extraordinarily long answer name from a historical figure that took place very far away';
   d.querySelector('.stat-gap strong').textContent='12,345.67 kilometers';
   d.querySelector('.compact-meta').textContent='YOUR VALUE: 15,789 kilometers · LIMIT: 200,000 kilometers';
   d.querySelector('.compact-note').textContent='Too far from the limit. Scoring stops after 500 km. This answer earns 0 points.';}''')
  check(page,f'long answer {w}x{h}')
  page.locator('#nextBtn').click()
  assert page.locator('#answerForm').count()==1, f'Button must advance to the next question: {w}x{h}'
  page.close()
 browser.close()
