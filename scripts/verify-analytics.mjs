// node scripts/verify-analytics.mjs [Playwright package path] [screenshot folder]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createDomain } from '../src/domain.ts';
import { createViewer } from '../src/viewer.ts';
const {chromium}=createRequire(import.meta.url)(process.argv[2] || 'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const domain=createDomain(),now=new Date(2026,9,19,12).getTime();
const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#151b35"/><circle cx="800" cy="200" r="250" fill="#86558c"/><circle cx="400" cy="500" r="150" fill="#344f60"/></svg>');
const settings={period:'month',includeWatched:true,includeCompleted:true,includeRatings:true,recommendations:true,autoAdvance:false};
const all=Array.from({length:5},(_,i)=>domain.mediaFromBase({id:i+1,type:'ANIME',duration:24,episodes:24,title:{userPreferred:'Anime '+(i+1)},bannerImage:art,coverImage:{large:art}}, {progress:24,status:'COMPLETED'}));
const listActivities=Array.from({length:19},(_,i)=>({mediaId:i%5+1,createdAt:new Date(2026,9,i+1,12).getTime(),status:'watched episode',progress:'1 - '+(i%4+1)}));
const errors=[];
try {
  for(const [width,height] of [[1920,1080],[1440,900],[800,600],[390,844]]){
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('http**/*',route=>route.abort());
    const session=domain.buildSession(all,{},[],settings,now,{listActivities});
    session.recommendations=[{...all[0],reason:'Similar taste',affinityScore:1,sourceRank:1,sourceMediaId:1}];
    await page.setContent(createViewer().documentFor({session,settings}));
    await page.locator('.loading.hidden').waitFor();
    const slide=page.locator('.slide.analytics'),index=Number(await slide.getAttribute('data-index'));
    for(let i=0;i<index;i++)await page.keyboard.press('ArrowRight');
    await page.locator('.analytics.active').waitFor();
    assert.equal(await slide.locator('.analytics-target').count(),19);
    const heading=await slide.locator('h2').boundingBox(),chrome=await page.locator('.chrome').boundingBox();
    assert.ok(heading.y>chrome.y+chrome.height);
    assert.equal(await slide.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    const point=slide.locator('[data-point="9"]');
    await point.hover();
    const tip=slide.locator('.analytics-tooltip');await tip.waitFor({state:'visible'});
    assert.match(await tip.textContent(),/2 recorded episodes/);
    await point.click();
    assert.match(await page.locator('.slide.active').getAttribute('class'),/analytics/);
    await slide.locator('[data-interval="weekly"]').click();
    assert.equal(await slide.locator('.analytics-target').count(),4);
    await slide.locator('[data-metric="hours"]').click();
    assert.equal(await slide.locator('[data-metric="hours"]').getAttribute('aria-pressed'),'true');
    await slide.locator('.analytics-target').first().focus();
    await tip.waitFor({state:'visible'});
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#pause').getAttribute('aria-label'),'Resume auto-advance');
    const box=await tip.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height);
    const bg=await page.locator('.bg-layer.active').evaluate(el=>el.style.backgroundImage);
    assert.ok(bg.includes('data:image/svg+xml'));
    if(process.argv[3]){await mkdir(process.argv[3],{recursive:true});await page.screenshot({path:process.argv[3]+'/'+width+'-analytics.png'});}
    await page.locator('#pause').focus();await page.keyboard.press('ArrowRight');
    assert.match(await page.locator('.slide.active').getAttribute('class'),/recommend/);
    await page.keyboard.press('Escape');assert.match(await page.locator('#app').getAttribute('class'),/closing/);
    await page.close();console.log(width+'×'+height+': chart, interval/metric controls, hover/tap/focus, tooltip bounds, background and navigation pass');
  }
  const page=await browser.newPage();
  const session=domain.buildSession([],{},[],settings,now);
  await page.setContent(createViewer().documentFor({session,settings}));
  await page.locator('.loading.hidden').waitFor();
  const index=Number(await page.locator('.slide.analytics').getAttribute('data-index'));
  for(let i=0;i<index;i++)await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.analytics.active').textContent(),/No dated watch activity/);
  await page.locator('[data-metric="hours"]').click();
  assert.match(await page.locator('.analytics-summary').textContent(),/unavailable/);
  await page.close();assert.deepEqual(errors,[]);
}finally{await browser.close();}
