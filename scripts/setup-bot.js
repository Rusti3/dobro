import {telegramCall} from '../server/telegram.js';
const token=process.env.TELEGRAM_BOT_TOKEN,url=process.env.MINI_APP_URL;
if(!token||!url?.startsWith('https://'))throw new Error('Set TELEGRAM_BOT_TOKEN and HTTPS MINI_APP_URL in .env');
await telegramCall(token,'deleteWebhook',{drop_pending_updates:false});
await telegramCall(token,'setMyCommands',{commands:[{command:'start',description:'Сделать первый шаг'},{command:'plan',description:'Мой план'},{command:'help',description:'Как всё устроено'},{command:'stop',description:'Отключить напоминания'},{command:'delete',description:'Удалить мои данные'}]});
await telegramCall(token,'setChatMenuButton',{menu_button:{type:'web_app',text:'Первый шаг',web_app:{url}}});
console.log('Bot commands and menu configured. Start exactly one server process for polling.');
