import assert from 'node:assert/strict';
import { gardenFor } from '../../src/garden-model.js';

export async function checkDemoApi(base, {restart} = {}) {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.mode,'demo','Refusing writes to a non-demo server');
  const clients = [];
  function client() {
    let cookie = '';
    const request = async (url,method='GET',body) => {
      const r = await fetch(`${base}/api${url}`,{method,headers:{'Content-Type':'application/json',Cookie:cookie},...(body!==undefined?{body:JSON.stringify(body)}:{})});
      const setCookie = r.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return {status:r.status,data:await r.json()};
    };
    clients.push(request);
    return request;
  }
  const a=client(),b=client();
  try {
    const initial=(await a('/bootstrap')).data;
    assert.equal(initial.user.gardenIntroSeen,false);
    assert.equal(initial.user.locationPromptSeen,false);
    assert.equal(initial.recommendations.stage,'interests');
    assert.equal(initial.plans.length,1);
    const training=initial.plans[0];
    assert.equal(training.demo,true); assert.equal(training.status,'ready');
    assert.ok(Date.parse(training.when)<Date.now());
    assert.equal(gardenFor(initial.plans,initial.user.id).completed.length,0);
    await b('/bootstrap'); await b('/profile','PATCH',{age:23});
    assert.equal((await b(`/plans/${training.id}`,'PATCH',{status:'done',reflection:'warm'})).status,404);
    assert.equal((await a('/profile','PATCH',{interests:['animals','ecology'],volunteerExperience:'first_time'})).status,200);
    const selected=(await a('/bootstrap')).data;
    assert.ok(selected.catalog.length>100);
    assert.ok(selected.catalog.every(e=>e.demo && e.image.startsWith('/theme-images/')));
    for(let i=0;i<6;i++) {
      const boot=(await a('/bootstrap')).data;
      assert.equal(boot.recommendations.stage,'calibration'); assert.equal(boot.recommendations.target,6);
      assert.equal(new Set(boot.recommendations.items.map(e=>e.id)).size,6);
      const card=boot.recommendations.items[boot.recommendations.completed];
      assert.equal((await a('/recommendations/feedback','POST',{eventId:card.id,action:i%2?'skip':'like',context:'calibration'})).status,200);
    }
    const calibrated=(await a('/bootstrap')).data;
    assert.equal(calibrated.recommendations.stage,'feed'); assert.equal(calibrated.user.profile.age,null);
    assert.equal((await a('/profile','PATCH',{age:6})).status,400);
    await a('/profile','PATCH',{age:23});
    assert.equal((await a('/onboarding/location-intro-seen','POST',{})).status,200);
    assert.equal((await a('/onboarding/location-intro-seen','POST',{})).status,200);
    const feed=(await a('/bootstrap')).data;
    assert.deepEqual(feed.user.recommendation.calibration,calibrated.user.recommendation.calibration);
    assert.equal(new Set(feed.catalog.flatMap(e=>e.themes)).size,14);
    const rails=feed.recommendations.sections.flatMap(s=>s.eventIds);
    assert.equal(new Set(rails).size,rails.length);
    assert.equal((await a('/garden/intro-seen','POST',{})).status,200);
    assert.equal((await a('/garden/intro-seen','POST',{})).status,200);
    await a('/profile','PATCH',{reminders:false,gardenIntroSeen:false});
    assert.equal((await a('/bootstrap')).data.user.gardenIntroSeen,true);
    const event=feed.catalog.find(e=>e.id!==training.eventId && e.annotation?.facts?.minimumAge==null);
    assert.equal((await a('/events/'+event.id)).status,200);
    const saved=await Promise.all(Array.from({length:5},()=>a('/plans','POST',{eventId:event.id,mode:'solo'})));
    assert.equal(new Set(saved.map(r=>r.data.id)).size,1);
    assert.equal(saved.filter(r=>r.status===201).length,1);
    const plan=saved[0].data;
    assert.equal((await a(`/plans/${plan.id}`,'PATCH',{status:'done',reflection:'warm'})).status,400);
    const when=new Date(Date.now()+86400000).toISOString();
    await a(`/plans/${plan.id}`,'PATCH',{when,confirmed:true,meeting:'Тестовый вход'});
    assert.equal((await a(`/plans/${plan.id}`,'PATCH',{status:'done',reflection:'warm'})).status,400);
    const invite=await a(`/plans/${plan.id}/invite`,'POST',{});
    assert.equal(invite.status,201);
    assert.equal((await b('/invites/'+invite.data.code)).data.meeting,undefined);
    await b('/invites/'+invite.data.code,'POST',{});
    assert.equal((await b(`/plans/${plan.id}`,'PATCH',{status:'done',reflection:'warm'})).status,403);
    assert.equal((await a(`/plans/${plan.id}/invite`,'POST',{shareInMax:true})).status,403);
    const point=await a('/location','POST',{lat:55.7558,lng:37.6173}); assert.equal(point.status,200);
    assert.ok((await a('/bootstrap')).data.catalog.some(e=>e.distanceKm!==null));
    await a('/location','DELETE',{}); assert.equal((await a('/location')).data.location,null);
    assert.equal((await a('/location','POST',{lat:0,lng:0})).status,400);
    assert.equal((await a(`/plans/${training.id}`,'PATCH',{status:'done',reflection:'warm',hours:25})).status,400);
    const completed=await Promise.all(Array.from({length:3},()=>a(`/plans/${training.id}`,'PATCH',{status:'done',reflection:'warm',hours:2})));
    assert.equal(completed.filter(r=>r.status===200).length,1);
    const after=(await a('/bootstrap')).data;
    assert.equal(gardenFor(after.plans,after.user.id).completed.length,1);
    assert.equal(gardenFor(after.plans,after.user.id).hours,2);
    await a(`/plans/${plan.id}`,'PATCH',{status:'cancelled'});
    assert.equal(gardenFor((await a('/bootstrap')).data.plans,after.user.id).completed.length,1);
    if (restart) await restart();
    const persisted=(await a('/bootstrap')).data;
    assert.equal(persisted.user.gardenIntroSeen,true);
    assert.equal(persisted.user.locationPromptSeen,true);
    assert.equal(gardenFor(persisted.plans,persisted.user.id).completed.length,1);
    assert.equal((await a(`/plans/${training.id}`,'PATCH',{status:'done',reflection:'warm'})).status,400);
    assert.equal((await a('/bootstrap')).data.plans.filter(p=>p.demo).length,1);
    return {catalog:feed.catalog.length,calibration:6,completed:1,concurrentSave:'one plan',concurrentCompletion:'one reward',intro:'persisted'};
  } finally { for(const c of clients) await c('/me','DELETE',{}).catch(()=>{}); }
}
