import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url=process.env.FEED_TEST_URL || 'http://127.0.0.1:3410';
const catalog=Array.from({length:108},(_,i)=>({
  id:`browser-${i}`,title:`Тестовое дело ${i}`,short:`Тестовое дело ${i}`,intro:'Понятная разовая помощь рядом с домом.',
  theme:'animals',themes:['animals'],category:'animals',city:'Москва',matchedCities:['Москва'],
  startsAt:'2026-01-01',endsAt:'2030-01-01',lat:55.75,lng:37.61,age:null,
  traits:{format:'offline',duration:'short'},annotation:null,
}));
const payload={mode:'demo',plans:[],catalog,user:{id:'browser-user',name:'Анна',gardenIntroSeen:true,registered:true,interestOnboarded:true,onboarded:true,profile:{age:30,city:'Москва',interests:['animals']}},recommendations:{stage:'feed',version:2,sections:[],daily:{ids:[],feedback:[]}}};
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:430,height:932}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const endpoint=new URL(route.request().url()).pathname;
    await route.fulfill({json:endpoint==='/api/bootstrap'?payload:endpoint==='/api/location'?{location:null,pending:false}:{ok:true}});
  });
  await page.goto(url);
  await page.locator('.infinite-events .event-card').first().waitFor();
  let before=await page.locator('.infinite-events .event-card').count();
  assert.equal(before,12);
  for(let i=0;i<12 && before<catalog.length;i++) {
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForFunction(n=>document.querySelectorAll('.infinite-events .event-card').length>n,before,{timeout:5000});
    before=await page.locator('.infinite-events .event-card').count();
  }
  assert.equal(before,108);
  const titles=await page.locator('.infinite-events .event-card h3').allTextContents();assert.equal(new Set(titles).size,108);
  assert.equal(await page.getByRole('button',{name:'Показать ещё',exact:true}).count(),0);
  await page.getByPlaceholder('Найти дело').fill('Тестовое дело 10');
  await page.waitForFunction(()=>document.querySelectorAll('.infinite-events .event-card').length===9);
  await page.getByPlaceholder('Найти дело').fill('');
  await page.waitForFunction(()=>document.querySelectorAll('.infinite-events .event-card').length===12);
  await page.getByRole('button',{name:'Показать ещё',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.infinite-events .event-card').length>=24);
  await page.getByRole('button',{name:'Профиль',exact:true}).first().click();
  await page.getByRole('button',{name:'Дела',exact:true}).first().click();
  for(let i=0;i<12;i++) {
    const count=await page.locator('.infinite-events .event-card').count();
    if(count===108) break;
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForFunction(n=>document.querySelectorAll('.infinite-events .event-card').length>n,count,{timeout:5000});
  }
  assert.equal(await page.locator('.infinite-events .event-card').count(),108);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/feed-108-mobile.png'});
  console.log('PASS: all 108 cards loaded, no duplicates, search reset, manual fallback, tab return, no JS errors or horizontal overflow.');
} finally {await browser.close();}
