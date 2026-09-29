import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url=process.env.DEMO_TEST_URL || 'http://127.0.0.1:3210';
const health=await (await fetch(url+'/api/health')).json();
assert.equal(health.mode,'demo','Refusing to create profiles outside demo');
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true,args:['--enable-unsafe-swiftshader']});
fs.mkdirSync('test-results/garden',{recursive:true});
try {
  for(const theme of ['light','dark']) {
    const context=await browser.newContext({viewport:{width:430,height:932},colorScheme:theme});
    const page=await context.newPage();
    const errors=[],missing=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400 && /garden-assets|theme-images/.test(r.url()))missing.push(r.url());});
    await page.route('https://st.max.ru/js/max-web-app.js',r=>r.fulfill({contentType:'application/javascript',body:''}));
    try {
      await page.goto(url);
      await page.locator('.interest-panel').waitFor();
      assert.equal(await page.locator('.registration-screen').count(),0);
      assert.equal(new Set(await page.locator('.interest-image').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundImage))).size,14);
      await page.getByRole('button',{name:'Настроить ленту'}).click();
      for(let i=0;i<6;i++) await page.getByRole('button',{name:'Мне подходит',exact:true}).click();
      const age=page.getByRole('dialog',{name:'Сколько тебе лет?'});
      await age.getByLabel('Возраст',{exact:true}).fill('23');
      await age.getByRole('button',{name:'Сохранить',exact:true}).click();
      await age.waitFor({state:'detached'});
      await page.getByRole('button',{name:'Профиль',exact:true}).first().click();
      const intro=page.getByRole('dialog',{name:'Твой сад'});await intro.waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      assert.equal(await page.locator('.profile-hud-deeds strong').textContent(),'0');
      assert.equal(await page.getByRole('button',{name:/\+1|Сброс.*предпросмотр/}).count(),0);
      await page.locator('.garden-3d[data-stage="0"] canvas').waitFor({timeout:30000});
      await page.waitForLoadState('networkidle');
      await page.screenshot({path:`test-results/garden/intro-${theme}.png`});
      if(theme==='light') await page.keyboard.press('Escape');else await intro.getByRole('button',{name:'Посмотреть сад'}).click();
      await intro.waitFor({state:'detached'});
      await page.screenshot({path:`test-results/garden/zero-${theme}.png`});
      await page.reload();
      await page.getByRole('button',{name:'Профиль',exact:true}).first().click();
      await page.locator('.garden-3d canvas').waitFor();
      assert.equal(await page.locator('.garden-intro').count(),0);
      await page.locator('.profile-plans > summary').click();
      await page.getByRole('button',{name:'Открыть план',exact:true}).first().click();
      await page.getByRole('heading',{name:'Как всё прошло?',exact:true}).waitFor();
      await page.locator('.plan-content input[type="number"]').fill('2');
      await page.getByRole('button',{name:'Было тепло',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.profile-hud-deeds strong')?.textContent==='1');
      await page.locator('.garden-3d[data-stage="1"] canvas').waitFor();
      await page.waitForLoadState('networkidle');
      await page.screenshot({path:`test-results/garden/completed-${theme}.png`});
      const other=await browser.newContext({storageState:await context.storageState(),viewport:{width:430,height:932},colorScheme:theme});
      const otherPage=await other.newPage();await otherPage.goto(url);await otherPage.getByRole('button',{name:'Профиль',exact:true}).first().click();
      await otherPage.locator('.profile-hud-deeds strong').waitFor();
      assert.equal(await otherPage.locator('.garden-intro').count(),0);
      assert.equal(await otherPage.locator('.profile-hud-deeds strong').textContent(),'1');
      await other.close();
      assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      console.log(`PASS ${theme}: 6 swipes → age → zero garden → intro once → completed visit → garden 1 → second device`);
    } catch(error) {
      await page.screenshot({path:`test-results/garden/failed-${theme}.png`});
      console.error((await page.locator('body').innerText()).slice(0,500));throw error;
    } finally {await context.request.delete(url+'/api/me',{data:{}});await context.close();}
  }
} finally {await browser.close();}
