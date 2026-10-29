"""CLOSEISH V18.10 compact mobile result regression.

Checks that all result content is packed into one cluster and that NEXT ROUND
is reachable even in short in-app-browser visual viewports.
Run: python tests/round-result-mobile-v1810.browser.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'tests/layout-mobile-v186.browser.py').read_text().split('with sync_playwright() as p:')[0]
namespace={'__file__':str(ROOT/'tests/layout-mobile-v186.browser.py')}
exec(source,namespace)
boot=namespace['set_up']

def positions(page):
 return page.evaluate('''() => {
  function box(sel){let e=document.querySelector(sel);if(!e)return null;let r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}
  let a=document.querySelector('#gameArea');let r=document.querySelector('.reveal-compact');
  return {title:box('.compact-result-title'),details:box('.round-result-details'),action:box('#nextBtn'),card:box('#gameArea'),footer:box('.footer'),
   innerHeight,innerWidth,pageScrollH:document.documentElement.scrollHeight,pageScrollW:document.documentElement.scrollWidth,
   overCard:a.scrollHeight-a.clientHeight,overReveal:r.scrollHeight-r.clientHeight};
 }''')

def check(page,label):
 x=positions(page)
 assert x['title']['bottom']<=x['details']['top']<=x['details']['bottom']<=x['action']['top'],(label,x)
 assert x['details']['top']-x['title']['bottom'] <= 18,(label,'title/details gap',x)
 assert x['action']['top']-x['details']['bottom'] <= 18,(label,'details/action gap',x)
 assert x['action']['bottom']<=x['card']['bottom']-4,(label,'button clipped',x)
 assert x['action']['bottom']<x['footer']['top'],(label,'button hidden by footer',x)
 assert x['pageScrollH']<=x['innerHeight']+1 and x['pageScrollW']<=x['innerWidth']+1,(label,'page scrolling',x)
 assert x['overCard']<=1 and x['overReveal']<=1,(label,'clipped content',x)
 print('PASS',label,'buttonBottom',int(x['action']['bottom']),'viewport',x['innerHeight'])

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 cases=[(320,480),(320,568),(360,500),(360,540),(360,650),(360,740),(360,800),(375,667),(390,844),(430,932)]
 for w,h in cases:
  page=boot(browser,w,h)
  page.locator('#startBtn').click()
  page.locator('#skipBtn').click()
  # Backend results can include a verified-data explanation even for skipped rounds.
  page.evaluate('''() => {
   document.querySelector('.round-result-details').insertAdjacentHTML('beforeend',
    '<div class="compact-meta">The entered answer has no verified numeric value.</div>');
  }''')
  check(page,f'skipped {w}x{h}')
  # Exercise both explanatory paragraphs, as seen in the Messenger screenshot.
  page.evaluate('''() => {
   document.querySelector('.result-emblem').textContent='✳ TIME EXPIRED';
   document.querySelector('.result-head').textContent='TIME’S UP';
   document.querySelector('.round-result-details').insertAdjacentHTML('beforeend',
    '<div class="compact-note note-time">Time expired without a uniquely verified answer. 0 points.</div>');
  }''')
  check(page,f'timed out {w}x{h}')
  # Maximum-long eligible strings must not push the NEXT ROUND action off screen.
  page.evaluate('''() => {
   document.querySelector('.stat-tier strong').textContent=
    'A remarkably long name for a historically important event remembered by different communities';
   document.querySelector('.stat-gap strong').textContent='12,345.67 kilometers';
   document.querySelector('.compact-meta').textContent='YOUR VALUE: 15,789 kilometers · LIMIT: 200,000 kilometers';
  }''')
  check(page,f'long answer {w}x{h}')
  if (w,h) in [(320,568),(360,650),(390,844)]:
   path=ROOT.parent/f'mobile-result-v1810-{w}x{h}.png'
   page.screenshot(path=str(path))
  page.locator('#nextBtn').click()
  assert page.locator('#answerForm').count()==1,(w,h,'NEXT ROUND does not advance')
  page.close()
 browser.close()
print('All mobile result compact layout tests passed')
