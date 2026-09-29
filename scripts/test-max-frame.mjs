import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const base=process.env.FRAME_TEST_URL || 'http://127.0.0.1:3212';
const response=await fetch(base);
assert.equal(response.headers.get('x-frame-options'),null);
const policy=response.headers.get('content-security-policy');
assert.match(policy,/frame-ancestors 'self' https:\/\/web\.max\.ru;/);
assert.ok(!policy.includes("script-src 'self' 'unsafe-eval'"));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
try{
  for(const [origin,allowed] of [['https://web.max.ru',true],['https://untrusted.example',false]]){
    const context=await browser.newContext();const page=await context.newPage();const messages=[];
    page.on('console',message=>messages.push(message.text()));
    await page.route(origin+'/helpi-frame-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><iframe name="miniapp" src="${base}" style="width:430px;height:932px"></iframe>`}));
    await page.route('https://st.max.ru/js/max-web-app.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
    // Test framing without creating an account or sending messages.
    await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'FRAME_TEST_AUTH_REQUIRED'}}));
    await page.goto(origin+'/helpi-frame-test');
    if(allowed){
      await page.frameLocator('iframe').getByText('FRAME_TEST_AUTH_REQUIRED',{exact:true}).waitFor();
      console.log('PASS: MAX web origin can embed the real application');
    }else{
      await page.waitForTimeout(500);
      assert.equal(await page.frameLocator('iframe').locator('#root').count(),0);
      assert.ok(messages.some(message=>/frame-ancestors/.test(message)));
      console.log('PASS: unrelated origin remains blocked');
    }
    await context.close();
  }
}finally{await browser.close();}
