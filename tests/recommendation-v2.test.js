import test from 'node:test';
import assert from 'node:assert/strict';
import { activeLocation, distanceKm, LOCATION_TTL_MS } from '../server/location.js';
import { eventFeatures,effectiveSignals,preferenceProfile,scoreEvent,projectCandidates,recommendationViewV2,publicEvent,exclusiveSections } from '../server/recommendation-v2.js';
const now=Date.parse('2026-09-27T10:00:00Z');
const user=()=>({id:'u',registered:true,onboarded:true,interestOnboarded:true,profile:{city:'Москва',age:16,interests:['animals']},recommendation:{interactions:[],days:{}}});
const event=(id,task='packing')=>({id,theme:'animals',themes:['animals'],city:'Москва',age:12,endsAt:'2030-01-01',lat:55.756,lng:37.62,annotation:{format:'on_site',quality:{status:'suitable'},volunteerTasks:[task],complexity:{physicalLoad:'light',emotionalLoad:'low',skillRequirement:'briefing',socialLoad:'moderate',responsibility:'supervised_simple',entryBarrier:'registration',timeCommitment:'up_to_2h'},firstTime:{score:80},participation:{commitment:'one_off',modes:['solo']},facts:{minimumAge:12},filterTags:['first_time']}});
test('location expires at 24h and haversine rejects unknown coordinates',()=>{
  const point={lat:55.7558,lng:37.6173,at:new Date(now).toISOString()};
  assert.ok(activeLocation(point,now+LOCATION_TTL_MS-1));
  assert.equal(activeLocation(point,now+LOCATION_TTL_MS),null);
  assert.equal(distanceKm(point,{lat:null,lng:37}),null);
  assert.equal(distanceKm(point,{lat:0,lng:0}),null);
  assert.ok(Math.abs(distanceKm({lat:55.7558,lng:37.6173},{lat:59.9391,lng:30.3159})-634)<5);
});
test('all seven complexity dimensions are used, unknown is not easy',()=>{
  assert.equal(eventFeatures(event('1')).loads.length,7);
  const e=event('2'); e.annotation.complexity.physicalLoad='unknown';e.annotation.firstTime={score:null};
  assert.equal(eventFeatures(e).loads.length,6);
  assert.ok(scoreEvent(event('1'),preferenceProfile(user(),[],now))>scoreEvent(e,preferenceProfile(user(),[],now)));
});
test('strongest signal wins, cancellation removes plan and old evidence decays',()=>{
  const at=new Date(now).toISOString();
  const list=[{eventId:'1',action:'open_detail',at},{eventId:'1',action:'like',at},{eventId:'1',action:'plan',at}];
  assert.equal(effectiveSignals(list,now)[0].strength,3);
  assert.equal(effectiveSignals([...list,{eventId:'1',action:'cancel_plan',at}],now)[0].strength,1);
  assert.equal(effectiveSignals([...list,{eventId:'1',action:'completed',at}],now)[0].strength,5);
  assert.equal(effectiveSignals([{eventId:'1',action:'like',at:new Date(now-90*86400000).toISOString()}],now)[0].strength,.5);
});
test('choices distinguish tasks within the same theme; a skip is weaker than a like',()=>{
  const u=user(), packing=event('1'), walking=event('2','dog_walking');
  u.recommendation.interactions=[{eventId:'1',action:'like',at:new Date(now).toISOString(),features:eventFeatures(packing)}];
  const profile=preferenceProfile(u,[packing,walking],now);
  assert.ok(scoreEvent(packing,profile)>scoreEvent(walking,profile));
  const liked=profile.value('tasks','packing')-.5;
  u.recommendation.interactions[0].action='skip';
  assert.ok(liked>.5-preferenceProfile(u,[packing],now).value('tasks','packing'));
});
test('selects eligible vacancy before age, quality and city filters; online is global',()=>{
  const restricted=event('1');restricted.age=18;restricted.annotation.facts.minimumAge=18;
  const eligible=event('1');eligible.selectedVacancyId='child';eligible.city='Зеленоград';eligible.matchedCities=['Москва'];
  const hidden=event('2');hidden.annotation.quality.status='hidden';
  const online=event('3');online.city='Казань';online.annotation.format='online';
  const result=projectCandidates([{...restricted,variants:[restricted,eligible]},hidden,online],user(),{now});
  assert.deepEqual(result.map(x=>x.id),['1','3']);assert.equal(result[0].selectedVacancyId,'child');
  assert.equal(publicEvent(result[0]).variants,undefined);
});
test('age-free calibration preview uses annotated candidates but does not make them eligible for sign-up',()=>{
  const u=user();u.profile.age=null;
  const restricted=event('18+');restricted.age=18;restricted.annotation.facts.minimumAge=18;
  const ordinary=projectCandidates([restricted],u,{now});
  const preview=projectCandidates([restricted],u,{now,ignoreAge:true});
  assert.equal(ordinary.length,0);
  assert.equal(preview.length,1);
  assert.equal(preview[0].age,18);
});
test('nearby requires actual fresh point, excludes far, online and unknown; daily stays first',()=>{
  const u=user(), near=event('1'),far=event('2'),online=event('3'),unknown=event('4');
  far.lat=56;online.annotation.format='online';unknown.lat=null;
  const location={lat:55.7558,lng:37.6173,at:new Date(now).toISOString()};
  const catalog=projectCandidates([near,far,online,unknown],u,{now,location});
  const view=recommendationViewV2(u,catalog,'2026-09-27',{now,location});
  assert.equal(view.sections[0].id,'daily');
  const displayed=view.sections.flatMap(section=>section.eventIds);
  assert.equal(displayed.filter(id=>id==='1').length,1);
  assert.equal(view.sections.find(x=>x.id==='nearby').hidden,true);
  const absent=projectCandidates([near],u,{now});
  const empty=recommendationViewV2(u,absent,'2026-09-27',{now});
  assert.equal(empty.sections.find(x=>x.id==='nearby').locationRequired,true);
  assert.equal(empty.sections.find(x=>x.id==='nearby').eventIds.length,0);
});
test('each event appears in only its best-fitting recommendation rail',()=>{
  const items=[event('daily'),event('remote'),event('close'),event('easy'),event('other')];
  items[1].annotation.format='online';
  items[2].distanceKm=.5;
  items[2]._distanceKm=.5;
  const sections=exclusiveSections([
    {id:'daily',eventIds:['daily']},
    {id:'first_time',eventIds:['remote','close','easy']},
    {id:'nearby',eventIds:['close']},
    {id:'remote',eventIds:['remote']},
    {id:'taste',eventIds:items.map(item=>item.id)},
  ],items);
  assert.deepEqual(sections.find(section=>section.id==='remote').eventIds,['remote']);
  assert.deepEqual(sections.find(section=>section.id==='nearby').eventIds,['close']);
  assert.deepEqual(sections.find(section=>section.id==='first_time').eventIds,['easy']);
  const ids=sections.flatMap(section=>section.eventIds);
  assert.equal(ids.length,new Set(ids).size);
});
test('daily diverse exploration has no duplicates and is cached until context changes',()=>{
  const u=user();const catalog=Array.from({length:10},(_,i)=>({...event(String(i),'task'+i),theme:'theme'+i,themes:['theme'+i]}));
  const projected=projectCandidates(catalog,u,{now});
  const first=recommendationViewV2(u,projected,'2026-09-27',{now});
  assert.equal(first.daily.ids.length,4);assert.equal(new Set(first.daily.ids).size,4);
  assert.deepEqual(recommendationViewV2(u,projected,'2026-09-27',{now}).daily.ids,first.daily.ids);
});
