import {telegramCall} from '../server/telegram.js';
import {webhookSecret} from '../server/telegram-config.js';

const token=process.env.TELEGRAM_BOT_TOKEN?.trim();
const url=process.env.MINI_APP_URL?.trim().replace(/\/+$/,'');
if(!token || !url?.startsWith('https://')) throw new Error('Set TELEGRAM_BOT_TOKEN and HTTPS MINI_APP_URL.');
await telegramCall(token,'getMe',{});
await telegramCall(token,'setWebhook',{
  url:url+'/api/telegram',
  secret_token:webhookSecret(token,process.env.TELEGRAM_WEBHOOK_SECRET),
  allowed_updates:['message'],drop_pending_updates:false,
});
await telegramCall(token,'setChatMenuButton',{menu_button:{type:'web_app',text:'Добро',web_app:{url}}});
await telegramCall(token,'setMyCommands',{commands:[
  {command:'start',description:'Открыть приложение'},
  {command:'garden',description:'Сад добрых дел'},
  {command:'plan',description:'Мой план'},
  {command:'help',description:'Как всё устроено'},
  {command:'stop',description:'Отключить напоминания'},
  {command:'delete',description:'Удалить мои данные'},
]});
const info=await telegramCall(token,'getWebhookInfo',{});
console.log(JSON.stringify({url:info.url,pending:info.pending_update_count,lastError:info.last_error_message||null}));
