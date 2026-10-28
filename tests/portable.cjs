const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const {fresh,startSession}=await import('../src/model.js');
 const folder=path.resolve('releases/Madar-Study');const html=fs.readFileSync(path.join(folder,'Madar.html'),'utf8');
 const bank=JSON.parse(html.match(/<script id="bundled-questions" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 const q=bank.questions.find(q=>q.status==='validated'&&q.presentation==='source');assert.ok(q);
 const ready=bank.questions.filter(q=>q.status==='validated'&&q.sources.every(s=>s.year==='2027')).length;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});const context=await browser.newContext();
 const state=fresh();state.questions=[q];startSession(state,[q.id],'lesson','Portable source practice');
 await context.addInitScript(state=>{if(!localStorage.getItem('madar-study-v1'))localStorage.setItem('madar-study-v1',JSON.stringify(state));},state);
 const unexpected=[];const localImages=[];const origin='http://127.0.0.1:5199';
 await context.route('**/*',route=>{const url=new URL(route.request().url());
  if(url.origin===origin&&url.pathname==='/Madar.html'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:html});
  if(url.origin===origin&&/^\/question-assets\/[a-f0-9]{12}-p[1-9][0-9]*\.webp$/.test(url.pathname)){
   const file=path.join(folder,url.pathname.slice(1));if(fs.existsSync(file)){localImages.push(url.pathname);return route.fulfill({contentType:'image/webp',body:fs.readFileSync(file)});}
  }
  unexpected.push(url.href);return route.abort();
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/Madar.html#session');await page.locator('.question').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.question .required-source-image')].every(i=>i.complete&&i.naturalWidth>0));
 await page.locator(`input[value="${q.correctOptionId}"]`).check();await page.locator('[data-action=submit]').click();await page.locator('.feedback.success').waitFor();await page.reload();await page.locator('.feedback.success').waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('madar-study-v1')).attempts.length),1);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('madar-study-v1')).questions.length),0);
 await page.goto(origin+'/Madar.html#study');await page.locator('#main').waitFor();assert.match(await page.locator('.stats article').first().innerText(),new RegExp('/\\s*'+ready));
 assert.ok(localImages.length>0);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 console.log(`PASS: folder package hydrates ${ready} ready questions, scores and resumes with local source images and compact history; zero external requests. Native file:// navigation remains restricted in this environment.`);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
