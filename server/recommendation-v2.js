import { activeLocation, distanceKm, NEARBY_RADIUS_KM } from './location.js';

export const FEATURE_VERSION = 2;
export const GROUP_WEIGHTS = { themes: .25, tasks: .25, format: .15, loads: .15, duration: .10, requirements: .10 };
const SIGNAL = { open_detail: .15, like: 1, skip: -.25, plan: 3, completed: 5 };
const LOADS = ['physicalLoad','emotionalLoad','skillRequirement','socialLoad','responsibility','entryBarrier','timeCommitment'];
const known = (value) => value !== undefined && value !== null && value !== '' && !['unknown','unclear','unspecified'].includes(value);
const unique = (values) => [...new Set(values.filter(known).map(String))];
const live = (event, now) => !event.endsAt || Date.parse(event.endsAt) > now;
const hash = (value) => [...String(value)].reduce((n,c) => (n*31+c.charCodeAt(0))>>>0,7);

export function eventFeatures(event) {
  const a = event.annotation;
  const format = a ? a.format : event.traits?.format === 'online' ? 'online' : 'on_site';
  return {
    themes: unique([...(event.themes || [event.theme]), ...(a?.causeAreas || []).map(x=>`cause:${x}`), ...(a?.beneficiaryGroups || []).map(x=>`beneficiary:${x}`)]),
    tasks: unique([...(a?.volunteerTasks || []), ...(a?.structuredTasks || []).map(x=>`task:${String(x).trim().toLocaleLowerCase('ru-RU')}`)]),
    format: unique([format, ...(a?.participation?.modes || []).map(x=>`mode:${x}`)]),
    loads: unique(LOADS.filter(key=>known(a?.complexity?.[key])).map(key=>`${key}:${a.complexity[key]}`)),
    duration: unique([a?.participation?.commitment, known(a?.facts?.exactDurationMinutes) && a.facts.exactDurationMinutes > 0
      ? `minutes:${a.facts.exactDurationMinutes<=120?'short':a.facts.exactDurationMinutes<=240?'medium':'long'}` : null]),
    requirements: unique([...(a?.facts?.prerequisites || []), ...(a?.requirements?.ownResources || []), ...(a?.requirements?.additionalPrerequisites || [])]),
  };
}

// Preserve records for audit; the learner uses one strongest current signal per event.
export function effectiveSignals(interactions, now = Date.now()) {
  const byEvent = new Map();
  for (const item of [...interactions].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))) {
    const state = byEvent.get(item.eventId) || {};
    const action = item.action === 'like' && item.context === 'visit' ? 'completed'
      : item.action === 'like' && item.context === 'plan' ? 'plan' : item.action;
    if (action === 'cancel_plan') delete state.plan;
    else if (action === 'like' || action === 'skip') state.choice = { ...item, action };
    else if(action==='open_detail') state.open_detail ||= { ...item, action };
    else state[action] = { ...item, action };
    byEvent.set(item.eventId,state);
  }
  return [...byEvent.values()].map(state=>state.completed || state.plan || state.choice || state.open_detail).filter(Boolean)
    .map(item=>({ ...item, strength: SIGNAL[item.action] * 2 ** (-Math.max(0,now-Date.parse(item.at))/(90*86400000)) }));
}

export function preferenceProfile(user, catalog, now = Date.now()) {
  const evidence = {};
  const events = new Map(catalog.map(event=>[event.id,event]));
  for (const signal of effectiveSignals(user.recommendation?.interactions || [],now)) {
    const features = Object.keys(signal.features || {}).length ? signal.features : events.has(signal.eventId) ? eventFeatures(events.get(signal.eventId)) : {};
    for (const [group, values] of Object.entries(features)) {
      if(!Object.hasOwn(GROUP_WEIGHTS,group)||!Array.isArray(values)) continue;
      for (const value of values) {
        const key = `${group}/${value}`;
        const prior = group === 'themes' ? (user.profile?.interests || []).includes(value) ? .6 : .12 : .5;
        const entry = evidence[key] ||= { sum:3*prior, mass:3, observations:0 };
        entry.sum += Math.max(0,signal.strength);
        entry.mass += Math.abs(signal.strength);
        entry.observations += 1;
      }
    }
  }
  return {
    value(group,key) { const entry=evidence[`${group}/${key}`]; return entry ? entry.sum/entry.mass
      : group==='themes' ? (user.profile?.interests || []).includes(key) ? .6 : .12 : .5; },
    seen(group,key) { return evidence[`${group}/${key}`]?.observations || 0; },
  };
}

export function matchesCity(event, city) {
  if (event.annotation?.format==='online' || (!event.annotation && event.traits?.format==='online')) return true;
  const place=`${event.city || ''} ${event.address || ''}`.toLocaleLowerCase('ru-RU');
  if(place.includes(city.toLocaleLowerCase('ru-RU'))) return true;
  // A multi-city event's Moscow search match cannot make its Kazan vacancy local.
  if(['Москва','Санкт-Петербург','Казань','Рыбинск'].some(other=>other!==city&&place.includes(other.toLocaleLowerCase('ru-RU')))) return false;
  return event.matchedCities?.includes(city) || false;
}

function allowed(event,user,city,now,ignoreAge=false) {
  const age = Number(user.profile?.age);
  const minimum = event.annotation?.facts?.minimumAge ?? Number.parseInt(event.age,10);
  return live(event,now) && !['hidden','human_review'].includes(event.annotation?.quality?.status)
    && (ignoreAge || !Number.isFinite(minimum) || minimum<=0 || Number.isInteger(age) && age>=7 && age<=100 && age>=minimum)
    && matchesCity(event,city);
}

export function scoreEvent(event,profile,experience = null) {
  const features = eventFeatures(event);
  let fit = 0;
  for (const [group,weight] of Object.entries(GROUP_WEIGHTS)) {
    const values = features[group];
    fit += weight * (values.length ? values.reduce((sum,key)=>sum+profile.value(group,key),0)/values.length : 0);
  }
  const a = event.annotation;
  const first = Number.isFinite(a?.firstTime?.score) ? a.firstTime.score/100 : 0;
  const quality = a?.quality?.status==='suitable' ? 1 : a?.quality?.status==='clarification_required' ? .4 : 0;
  // Unknown experience retains the previous ranking. Explicit beginners favor verified ease of entry.
  if (experience === 'first_time') return .55*fit + .30*first + .15*quality;
  if (experience === 'experienced') return .77*fit + .08*first + .15*quality;
  return .65*fit + .2*first + .15*quality;
}

export function projectCandidates(catalog,user,options={}) {
  const now = options.now ?? Date.now();
  const city = options.city || user.profile?.city || 'Москва';
  const location = activeLocation(options.location,now);
  const profile = preferenceProfile(user,catalog,now);
  return catalog.flatMap(base=>{
    const variants = base.variants?.length ? base.variants : [base];
    const candidates = variants.filter(event=>allowed(event,user,city,now,options.ignoreAge===true)).map(event=>{
      const { variants: omitted, ...safe } = event;
      const effectiveMinimumAge = event.annotation?.facts?.minimumAge ?? event.age ?? null;
      const online = event.annotation?.format==='online' || (!event.annotation && event.traits?.format==='online');
      const km = online ? null : distanceKm(location,event);
      const score = scoreEvent(event,profile,user.profile?.volunteerExperience);
      const contextScore = location ? .9*score+.1*(km===null?.5:Math.exp(-km/10)) : score;
      return { ...safe, age: effectiveMinimumAge, distanceKm: km===null?null:Math.round(km*10)/10, _distanceKm:km, _score:contextScore };
    }).sort((a,b)=>b._score-a._score || String(a.selectedVacancyId).localeCompare(String(b.selectedVacancyId)));
    if (!candidates.length) return [];
    const event=candidates[0];
    const reasons=[];
    if (eventFeatures(event).tasks.some(key=>profile.seen('tasks',key)>0 && profile.value('tasks',key)>.55)) reasons.push('Похоже на задачи, которые тебе понравились');
    if (event.annotation?.participation?.commitment==='one_off') reasons.push('Разовая помощь');
    if (event._distanceKm!==null && event._distanceKm<=NEARBY_RADIUS_KM) reasons.push('Рядом');
    if (!reasons.length && (event.themes||[]).some(theme=>user.profile?.interests?.includes(theme))) reasons.push('По твоим интересам');
    return [{ ...event, recommendationReasons:reasons.slice(0,2) }];
  });
}

export function publicEvent(event) {
  const { variants, _score, _distanceKm, ...safe }=event;
  return safe;
}

function diverse(pool,count,initial=[]) {
  const result=[...initial];
  while(result.length<count) {
    const unused=pool.filter(event=>!result.some(item=>item.id===event.id));
    if (!unused.length) break;
    const next=unused.find(event=>result.filter(item=>item.theme===event.theme).length<2
      && (!event.annotation?.volunteerTasks?.[0] || result.filter(item=>item.annotation?.volunteerTasks?.[0]===event.annotation.volunteerTasks[0]).length<2)) || unused[0];
    result.push(next);
  }
  return result;
}

// A card has one home in the editorial rails. The daily pick is reserved first;
// the remaining cards go to the strongest matching explanation, not every tag.
export function exclusiveSections(sections,catalog) {
  const events=new Map(catalog.map(event=>[event.id,event]));
  const result=sections.map(section=>({...section,eventIds:[]}));
  const used=new Set();
  const dailyIndex=sections.findIndex(section=>section.id==='daily');
  if(dailyIndex>=0) for(const id of sections[dailyIndex].eventIds) {
    if(events.has(id)&&!used.has(id)) {result[dailyIndex].eventIds.push(id);used.add(id);}
  }
  const score=(section,event)=>{
    switch(section.id) {
      case 'remote': return 95;
      case 'nearby': return 78+Math.max(0,10-(event._distanceKm??event.distanceKm??10));
      case 'first_time': return 76+(event.annotation?.firstTime?.score||0)/10;
      case 'short': return 77;
      case 'weekend': return 73;
      case 'friends': return 70;
      case 'new': return 32;
      case 'taste': return 25;
      default: return 10;
    }
  };
  const membership=new Map();
  sections.forEach((section,index)=>{
    if(index===dailyIndex) return;
    section.eventIds.forEach((id,position)=>{
      if(!events.has(id)||used.has(id)) return;
      const choices=membership.get(id)||[];
      choices.push({index,position,fit:score(section,events.get(id))});
      membership.set(id,choices);
    });
  });
  const entries=[...membership.entries()].sort((a,b)=>Math.max(...b[1].map(x=>x.fit))-Math.max(...a[1].map(x=>x.fit)));
  for(const [id,choices] of entries) {
    choices.sort((a,b)=>b.fit-a.fit||a.position-b.position||a.index-b.index);
    const destination=choices.find(({index})=>result[index].eventIds.length<(sections[index].id==='nearby'?20:6));
    if(!destination) continue;
    result[destination.index].eventIds.push(id);
    used.add(id);
  }
  return result.map((section,index)=>({
    ...section,
    eventIds:section.eventIds.sort((a,b)=>sections[index].eventIds.indexOf(a)-sections[index].eventIds.indexOf(b)),
    // Nearby is only an empty state when there were genuinely no nearby cards.
    hidden: section.id==='nearby' && sections[index].eventIds.length>0 && section.eventIds.length===0,
  }));
}

export function recommendationViewV2(user,catalog,day,options={}) {
  const now=options.now??Date.now();
  const model=user.recommendation;
  const profile=preferenceProfile(user,catalog,now);
  const pool=[...catalog].sort((a,b)=>(b._score??scoreEvent(b,profile,user.profile?.volunteerExperience))-(a._score??scoreEvent(a,profile,user.profile?.volunteerExperience)) || hash(`${user.id}:${day}:${a.id}`)-hash(`${user.id}:${day}:${b.id}`));
  const signals=effectiveSignals(model.interactions||[],now);
  const unavailable=new Set(signals.filter(x=>['completed','plan'].includes(x.action)).map(x=>x.eventId));
  const recent=new Set(signals.filter(x=>now-Date.parse(x.at)<7*86400000).map(x=>x.eventId));
  let dailyPool=pool.filter(event=>!unavailable.has(event.id)&&!recent.has(event.id));
  if(dailyPool.length<4) dailyPool=pool.filter(event=>!unavailable.has(event.id));
  const location=activeLocation(options.location,now);
  const context=`v2:${options.city||user.profile?.city}:${location?.at||'no-location'}:${model.interactions?.length}:${model.interactions?.at(-1)?.at}:${hash(pool.map(e=>`${e.id}:${e.selectedVacancyId}:${e.annotation?.quality?.status}`).join('|'))}`;
  model.days ||= {};
  let daily=model.days[day];
  if(!daily || daily.context!==context) {
    const picks=diverse(dailyPool,3);
    const exploratory=dailyPool.filter(event=>event.annotation?.quality?.status==='suitable'&&!picks.some(x=>x.id===event.id));
    const novelty=event=>{
      const f=eventFeatures(event);
      const keys=[...f.tasks.map(x=>['tasks',x]),...f.themes.map(x=>['themes',x])];
      return keys.length ? keys.filter(([group,key])=>!profile.seen(group,key)).length/keys.length : 0;
    };
    exploratory.sort((a,b)=>(.7*(b._score??scoreEvent(b,profile,user.profile?.volunteerExperience))+.3*novelty(b))-(.7*(a._score??scoreEvent(a,profile,user.profile?.volunteerExperience))+.3*novelty(a)));
    const all=diverse(exploratory.length?exploratory:dailyPool,4,picks);
    daily=model.days[day]={context,ids:all.map(e=>e.id),feedback:daily?.feedback||[]};
    for(const old of Object.keys(model.days).sort().slice(0,-14)) delete model.days[old];
  }
  const tagged=(tag)=>diverse(pool.filter(e=>e.annotation?.filterTags?.includes(tag)),6).map(e=>e.id);
  const nearby=pool.filter(e=>e._distanceKm!==null && e._distanceKm!==undefined && e._distanceKm<=NEARBY_RADIUS_KM)
    .sort((a,b)=>a._distanceKm-b._distanceKm || b._score-a._score).slice(0,20);
  const sections=exclusiveSections([
    {id:'daily',title:'Для тебя',eventIds:daily.ids},
    {id:'first_time',title:'Хорошо для первого раза',eventIds:tagged('first_time')},
    {id:'nearby',title:'Рядом с тобой',subtitle:location?'В пределах 10 км по прямой':'Поделись геопозицией, чтобы увидеть дела рядом',eventIds:nearby.map(e=>e.id),locationRequired:!location,empty:!!location&&!nearby.length},
    {id:'weekend',title:'На выходные',eventIds:tagged('weekend')},
    {id:'friends',title:'Можно пойти с друзьями',eventIds:tagged('friends')},
    {id:'short',title:'На час-два',eventIds:tagged('short')},
    {id:'remote',title:'Помочь из дома',eventIds:pool.filter(e=>e.annotation?.format==='online'||!e.annotation&&e.traits?.format==='online').slice(0,6).map(e=>e.id)},
    {id:'taste',title:'Похоже, тебе понравится',eventIds:diverse(pool,6).map(e=>e.id)},
    {id:'new',title:'Попробовать что-то новое',eventIds:diverse(dailyPool.filter(e=>!recent.has(e.id)&&e.annotation?.quality?.status==='suitable'),6).map(e=>e.id)},
  ].filter(s=>s.id==='nearby'||s.id==='daily'||s.eventIds.length),catalog);
  return {stage:'feed',version:2,daily:{date:day,ids:daily.ids,completed:daily.feedback.length,target:daily.ids.length,feedback:daily.feedback},sections,taste:[]};
}
