import {createHmac,timingSafeEqual} from 'node:crypto';
export function telegramUser(raw, token, now=Date.now()) {
 const q=new URLSearchParams(raw); const hash=q.get('hash'); q.delete('hash');
 if(!token||!hash||!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Откройте приложение заново из Telegram.');
 const age=now/1000-Number(q.get('auth_date')); if(!Number.isFinite(age)||age< -30||age>3600) throw new Error('Сессия истекла. Откройте приложение заново.');
 const data=[...q.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const key=createHmac('sha256','WebAppData').update(token).digest();
 const expected=createHmac('sha256',key).update(data).digest();
 if(!timingSafeEqual(expected,Buffer.from(hash,'hex'))) throw new Error('Не удалось подтвердить Telegram-сессию.');
 const u=JSON.parse(q.get('user')||'{}'); if(!Number.isSafeInteger(u.id)||u.id<=0) throw new Error('Нет пользователя Telegram.'); return u;
}
export function validatePlan(input,event,now=Date.now()) {
 if(!event||Date.parse(event.endsAt)<now) throw new Error('Событие завершилось. Выберите другое дело.');
 const when=input.when||null;
 if(when&&(!Number.isFinite(Date.parse(when))||Date.parse(when)<=now||Date.parse(when)<Date.parse(event.startsAt)||Date.parse(when)>Date.parse(event.endsAt))) throw new Error('Выберите будущую дату в периоде события.');
 return {when,meeting:String(input.meeting||'').trim().slice(0,240),mode:['friend','solo'].includes(input.mode)?input.mode:'friend',confirmed:!!input.confirmed};
}
export function makeMessage(event) {return `Здравствуйте! Хочу впервые помочь: «${event.title}». Подскажите, пожалуйста, можно ли прийти новичку, какие будут задачи и сколько длится смена? Какую дату можно выбрать, что взять с собой, кто и где меня встретит? Можно ли прийти с другом? Есть ли ограничения по возрасту или здоровью?`;}
export function botReply(text,name='друг') {
 const cmd=text?.split(/[ @]/)[0];
 if(cmd==='/help') return 'Первый шаг помогает подготовить первый визит: выбрать дело, написать организатору, позвать друга и сохранить план. Запись на событие — у организатора. /garden — сад добрых дел, /plan — мой план, /stop — отключить напоминания, /delete — удалить мои данные.';
 if(cmd==='/stop') return 'Напоминания отключены. Можно вернуться в своём темпе.';
 return `Привет, ${name}! Начать помогать можно с одного небольшого шага. Подберём дело, подготовим вопросы организатору и позовём знакомого человека. Без рейтингов и обязательств. Открой мини-приложение ниже.`;
}
