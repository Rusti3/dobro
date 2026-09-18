import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import handler from '../api/[[...path]].js';
import {webhookSecret} from '../server/telegram-config.js';

const token='test-vercel-token';
function init(id=987654321){
 const q=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Тест'})});
 const payload=[...q].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 q.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update(payload).digest('hex'));
 return q.toString();
}
async function call(url,method='GET',body,headers={}){
 const req={url,method,body,headers:{host:'example.test',...headers},async *[Symbol.asyncIterator](){}};
 const res={code:200,status(c){this.code=c;return this},setHeader(){return this},json(data){this.data=data;return this}};
 await handler(req,res);return res;
}
test('Vercel handles Telegram bootstrap, parsed JSON and authenticated webhooks',async t=>{
 const old={...process.env};const fetchBefore=globalThis.fetch;
 t.after(()=>{for(const k of ['TELEGRAM_BOT_TOKEN','MINI_APP_URL','TELEGRAM_WEBHOOK_SECRET','DEMO_MODE']){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}globalThis.fetch=fetchBefore;});
 delete process.env.TELEGRAM_BOT_TOKEN;process.env.DEMO_MODE='false';delete process.env.TELEGRAM_WEBHOOK_SECRET;
 assert.equal((await call('/api/bootstrap','GET',undefined,{'x-telegram-init-data':init()})).code,503);
 process.env.TELEGRAM_BOT_TOKEN=token;process.env.MINI_APP_URL='https://example.test/';
 assert.equal((await call('/api/bootstrap')).code,401);
 const headers={'x-telegram-init-data':init()};
 const first=await call('/api/bootstrap','GET',undefined,headers);assert.equal(first.code,200);assert.equal(first.data.user.profile.category,'all');
 await call('/api/profile','PATCH',{category:'animals',barrier:'time'},headers);
 assert.equal((await call('/api/bootstrap','GET',undefined,headers)).data.user.profile.category,'animals');
 const saved=await call('/api/plans','POST',{eventId:'11597695'},headers);assert.equal(saved.code,201);
 assert.equal((await call('/api/telegram','POST',{update_id:1})).code,403);
 let sent;
 globalThis.fetch=async(url,options)=>{sent=JSON.parse(options.body);return {json:async()=>({ok:true,result:{}})}};
 const update={update_id:2,message:{text:'/start',chat:{id:987654321,type:'private'},from:{id:987654321,first_name:'Тест'}}};
 const webhookHeaders={'x-telegram-bot-api-secret-token':webhookSecret(token)};
 assert.equal((await call('/api/telegram','POST',update,webhookHeaders)).code,200);
 assert.equal(sent.reply_markup.inline_keyboard[0][0].web_app.url,'https://example.test');
 globalThis.fetch=async()=>({json:async()=>({ok:false,error_code:401})});
 assert.equal((await call('/api/telegram','POST',update,webhookHeaders)).code,502);
});
