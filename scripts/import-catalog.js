import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(root, '../afisha-2026-09-09-delivery');
const curated = {
 '11597695': {category:'animals', short:'Помочь кошкам найти дом', intro:'Покормить кошек, позаботиться о пространстве и помочь сотрудникам «Котеешной».', support:'Есть вводный инструктаж', why:'В описании указаны инструктаж и сопровождение координатора.', first:'Уточнить у координатора ближайшую смену, её длительность и требования к новичкам.'},
 '11597698': {category:'animals',short:'Забота о кошках в котокафе',intro:'Уход за кошками и помощь в повседневных делах приюта открытого типа.',support:'Знакомство с координатором',why:'Задачи и условия уточняются у организатора перед первым посещением.',first:'Спросить, какие задачи доступны на первой смене и кто вас встретит.'},
 '11675000': {category:'people',short:'Творить вместе в мастерской',intro:'Керамика, кулинария и другие занятия вместе с людьми с ментальными особенностями.',support:'Сначала вводная встреча',why:'Организатор предлагает вводную встречу и подбор комфортного формата.',first:'Заполнить анкету на сайте фонда и договориться о вводной встрече. Адрес площадки уточнить отдельно.'},
 '11521651': {category:'people',short:'В гости с четвероногим другом',intro:'Прийти со своей собакой в пансионат и подарить пожилым людям немного общения.',support:'По договорённости',why:'Можно согласовать удобную площадку и дату. Нужен свой питомец и согласование.',first:'Написать организатору, выбрать пансионат и отправить фотографию питомца. Без договорённости не приезжать.'},
 '11013932': {category:'animals',short:'Поддержать животных в приюте',intro:'Помочь с кормом, прогулками или рассказать о потребностях приютов.',support:'Можно выбрать формат',why:'В источнике перечислены разные способы помощи, в том числе информационная.',first:'Уточнить конкретный приют, доступные новичкам задачи и правила посещения.'},
 '11780208': {category:'animals',short:'Счастливый день в приюте',intro:'Прогуляться с собаками, пообщаться с животными или помочь по хозяйству.',support:'Визит нужно согласовать',why:'В источнике можно выбрать удобный день, но приют и контакт нужно найти самостоятельно.',first:'Оставить заявку на ДОБРО, выбрать приют и отдельно согласовать посещение.'}
};
const rows=fs.readFileSync(path.join(source,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const unique=new Map();
for(const r of rows) if(r.source==='dobro' && curated[r.externalId] && !unique.has(r.externalId)) unique.set(r.externalId,r);
fs.mkdirSync(path.join(root,'data'),{recursive:true}); fs.mkdirSync(path.join(root,'public/images'),{recursive:true});
const events=[...unique.values()].map(r=>{let image=null; if(r.imageFile && fs.existsSync(path.join(source,r.imageFile))){ const ext=path.extname(r.imageFile); image=`/images/${r.externalId}${ext}`; fs.copyFileSync(path.join(source,r.imageFile),path.join(root,'public',image)); } return {id:r.externalId,title:r.title,...curated[r.externalId],city:r.city,address:r.address,startsAt:r.startsAt,endsAt:r.endsAt,description:r.description,url:r.sourceUrl,image,source:'ДОБРО',snapshot:'2026-09-09',timezone:r.timezone||'Europe/Moscow',age:r.ageRestriction||null};});
events.sort((a,b)=>Object.keys(curated).indexOf(a.id)-Object.keys(curated).indexOf(b.id));
fs.writeFileSync(path.join(root,'data/catalog.json'),JSON.stringify(events,null,2));
console.log(`Imported ${events.length} curated records; all dates and source descriptions preserved.`);
