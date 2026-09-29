import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { themeArtwork } from '../shared/theme-artwork.js';

const themes = JSON.parse(fs.readFileSync(new URL('../data/demo-themes.json', import.meta.url), 'utf8'));
const cities = ['Москва', 'Санкт-Петербург', 'Казань', 'Рыбинск'];
const centers = [[55.7558,37.6173],[59.9343,30.3351],[55.7961,49.1064],[58.0484,38.8584]];
const day = 86400000;

export function demoDataEnabled(env = process.env) {
  if (env.DEMO_DATA !== 'true') return false;
  if (env.DEMO_MODE === 'false') throw new Error('DEMO_DATA is forbidden in MAX production mode');
  return true;
}

export function demoCatalog(epoch) {
  const start = Date.parse(epoch);
  if (!Number.isFinite(start)) throw new Error('Invalid demo epoch');
  return cities.flatMap((city, cityIndex) => themes.flatMap(theme => Array.from({length:12}, (_, i) => {
    const id = `demo-${cityIndex}-${theme.id}-${i + 1}`;
    const title = `[Тест] ${theme.title} · ${i + 1}`;
    const minutes = i % 3 === 0 ? 60 : i % 3 === 1 ? 120 : 180;
    const startsAt = new Date(start - 30 * day).toISOString();
    const endsAt = new Date(start + 365 * day).toISOString();
    return {
      id, demo:true, title, short:title, city, theme:theme.id, themes:[theme.id],
      category:theme.id === 'animals' ? 'animals' : 'people', gardenCategory:theme.id,
      image:themeArtwork[theme.id], startsAt, endsAt, age:theme.minimumAge || null,
      lat:centers[cityIndex][0] + i * .003, lng:centers[cityIndex][1] + i * .002,
      address:`${city}, тестовая площадка ${i + 1}`,
      intro:'Тестовое дело для проверки приложения. Участие и отправка сообщений не выполняются.',
      description:`Тестовые данные: ${theme.title.toLocaleLowerCase('ru-RU')}. Задачу объясняет координатор. Продолжительность — ${minutes} минут. Можно прийти с другом.`,
      first:'Свяжись с организатором и согласуй время.',
      support:'Тестовый координатор', source:'demo', url:'https://dobro.ru/',
      traits:{format:theme.online?'online':'offline',social:i%2?'group':'solo',activity:'physical',duration:minutes<=120?'short':'medium',weekend:false},
      annotation:{
        schemaVersion:'semantic-1.1.0', themeIds:[theme.id], causeAreas:[theme.cause], beneficiaryGroups:[theme.beneficiary],
        volunteerTasks:[theme.task], format:theme.online?'online':'on_site',
        participation:{modes:['small_group'],commitment:'one_off'},
        quality:{status:'suitable'}, firstTime:{score:80,verdict:'yes'},
        complexity:{overall:20 + i * 3,physicalLoad:'light',emotionalLoad:'low',skillRequirement:'briefing',socialLoad:i%2?'moderate':'low',responsibility:'supervised_simple',entryBarrier:'registration',timeCommitment:'up_to_2h'},
        facts:{minimumAge:theme.minimumAge || null,exactDurationMinutes:minutes,exactWeekendDate:null,prerequisites:[]},
        requirements:{ownResources:[],additionalPrerequisites:[],unknownConditions:[]},
        filterTags:['first_time','friends',...(minutes<=120?['short']:[]),...(theme.online?['remote']:[])],
        shortExplanation:'Синтетическая разметка тестового дела, не результат LLM.',
      },
    };
  })));
}

export async function seedDemoCatalog(pool) {
  if (!demoDataEnabled()) return 0;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('helpi_demo_seed'))");
    const result = await client.query(`insert into service_meta(key,value) values('demo_epoch',$1)
      on conflict(key) do update set value=service_meta.value returning value`, [new Date().toISOString()]);
    const events = demoCatalog(result.rows[0].value);
    for (const event of events) {
      await client.query(`insert into events(id,source,source_url,title,city,starts_at,ends_at,content_hash,catalog_data)
        values($1,'demo',$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict(id) do nothing`,
      [event.id,event.url,event.title,event.city,event.startsAt,event.endsAt,createHash('sha256').update(JSON.stringify(event)).digest('hex'),JSON.stringify(event)]);
      await client.query('insert into event_cities(event_id,city) values($1,$2) on conflict do nothing', [event.id,event.city]);
    }
    await client.query('commit');
    return events.length;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}

export async function seedDemoPlan(store, repository, user) {
  if (!demoDataEnabled() || !user.id.startsWith('demo:')) return;
  const hash = createHash('sha256').update(`demo-plan:${user.id}`).digest('hex').slice(0,32);
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20)}`;
  if (await store.plan(id)) return;
  const event = await repository.event('demo-0-charity-1');
  if (!event) throw new Error('Demo catalog must be seeded before creating a profile');
  await store.createPlan({id,owner:user.id,eventId:event.id,eventSnapshot:event,demo:true,
    when:new Date(Date.now()-day).toISOString(),meeting:'Тестовая встреча: согласование уже отмечено',
    mode:'solo',confirmed:true,status:'ready',checks:['contact','route','bag'],members:[],
    createdAt:new Date().toISOString(),agreedAt:new Date(Date.now()-2*day).toISOString(),reflection:null});
}
