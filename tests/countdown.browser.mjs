// Optional Playwright integration test. BACKEND_DIR must point to the independent backend.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
if(!process.env.BACKEND_DIR)throw new Error('Set BACKEND_DIR to the separate CLOSEISH-backend directory');
const frontend=fileURLToPath(new URL('../',import.meta.url)),backend=path.resolve(process.env.BACKEND_DIR);
const apiPort=3310,webPort=5183,base='http://127.0.0.1:'+webPort,children=[];
function launch(file,cwd,env,ready){
 const child=spawn(process.execPath,[file],{cwd,env:{...process.env,...env},stdio:['ignore','pipe','inherit']});children.push(child);
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timeout: '+file)),15000);child.stdout.on('data',chunk=>{if(String(chunk).includes(ready)){clearTimeout(timer);resolve(child)}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Exited '+file+': '+code))})});
}
let browser;
try{
 await launch('src/server.mjs',backend,{NODE_ENV:'development',DEV_DATE:'2026-10-22',HOST:'127.0.0.1',PORT:String(apiPort),DATABASE_URL:'',STATS_MODE:'memory',ALLOWED_ORIGINS:base,RATE_LIMIT_PER_MINUTE:'0'},'CLOSEISH API');
 await launch('scripts/dev.mjs',frontend,{WEB_PORT:String(webPort),API_PROXY_TARGET:'http://127.0.0.1:'+apiPort},'CLOSEISH frontend');
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext(),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 await page.goto(base);await page.locator('#startBtn').click();
 assert.equal(await page.locator('#clock').innerText(),'30s');
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('closeish-pending-v1')));
 const deadline=(await saved()).activeDeadline;
 let marker=requests.length;
 await page.waitForTimeout(3200);const onlineClock=parseInt(await page.locator('#clock').innerText());
 assert.ok(onlineClock<=27&&onlineClock>=25);assert.equal(requests.length-marker,0,'Idle countdown must not make any requests');
 await context.setOffline(true);await page.waitForTimeout(3200);
 const offlineClock=parseInt(await page.locator('#clock').innerText());assert.ok(offlineClock<onlineClock);
 assert.equal(requests.length-marker,0,'Offline countdown must not attempt tick requests');
 await context.setOffline(false);await page.reload();await page.locator('#clock').waitFor();
 assert.equal((await saved()).activeDeadline,deadline,'Reload must preserve the deadline');
 assert.ok(parseInt(await page.locator('#clock').innerText())<=offlineClock);
 marker=requests.length;await context.setOffline(true);
 await page.waitForFunction(()=>document.getElementById('clock')?.textContent==='00s',{},{timeout:35000});
 await page.getByRole('button',{name:'RETRY ↗',exact:true}).waitFor();
 const pending=await saved();assert.equal(pending.pendingSubmission.kind,'timeout');assert.equal(pending.activeRound,0);
 const attempts=requests.slice(marker);assert.equal(attempts.length,1);assert.ok(attempts[0].url.endsWith('/answer'));
 await context.setOffline(false);await page.locator('#nextBtn').waitFor();
 const first=await saved();assert.equal(first.responses[0].kind,'timeout');assert.equal(first.responses[0].points,0);assert.ok(first.responses[0].receipt);
 for(let i=0;i<5;i++){await page.locator('#nextBtn').click();await page.locator('#skipBtn').click()}
 await page.locator('#nextBtn').click();await page.locator('.end-screen').waitFor();
 await page.waitForFunction(()=>CLOSEISHStats.state('2026-10-22').data?.total===1);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,independentFrontendAndBackend:true,roundSeconds:30,idleTickRequests:0,offlineCountdown:true,reloadPreservesDeadline:true,timeoutRequestsAtZero:1,offlineTimeoutRetried:true,fullGameAndStatistics:true},null,2));
}finally{
 if(browser)await browser.close();
 for(const child of children)child.kill('SIGTERM');
 await Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve))));
}
