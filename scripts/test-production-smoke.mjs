import assert from 'node:assert/strict';
import {createHmac,randomInt} from 'node:crypto';
const base=process.env.SMOKE_URL || 'https://helpi.135-106-219-68.sslip.io';
let cookie='';
const token=process.env.MAX_BOT_TOKEN;
let initData='';
if(token){
  const fields=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:randomInt(100000000,999999999),first_name:'Проверка'})});
  const check=[...fields.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  fields.set('hash',createHmac('sha256',secret).update(check).digest('hex'));
  initData=fields.toString();
}
async function api(path,method='GET',body) {
  const response=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json',...(initData?{'X-Max-Init-Data':initData}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
  const data=await response.json();
  assert.ok(response.ok,`${method} ${path}: ${response.status} ${data.error || ''}`);
  return data;
}
let newcomer;
try {
  newcomer=await api('/bootstrap');
  assert.equal(newcomer.user.registered,true);
  assert.equal(newcomer.recommendations.stage,'interests');
  assert.equal(newcomer.user.profile.age,null);
  await api('/profile','PATCH',{interests:['animals','ecology']});
  let initial=await api('/bootstrap');
  const catalogCount=initial.catalog.length;
  assert.ok(catalogCount>=6,`Expected at least 6 calibration previews, got ${catalogCount}`);
  assert.equal(initial.recommendations.target,6);
  assert.equal(new Set(initial.recommendations.items.map(item=>item.id)).size,6);
  for(const item of initial.recommendations.items || []) await api('/recommendations/feedback','POST',{eventId:item.id,context:'calibration',action:'like'});
  const feed=await api('/bootstrap');
  assert.equal(feed.recommendations.stage,'feed');
  await api('/profile','PATCH',{age:30});
  const aged=await api('/bootstrap');
  assert.equal(aged.user.profile.age,30);
  assert.equal(aged.recommendations.stage,'feed');
  const agedIds=aged.recommendations.sections.flatMap(section=>section.eventIds);
  assert.equal(new Set(agedIds).size,agedIds.length);
  assert.equal(feed.recommendations.version,2);
  assert.equal(feed.recommendations.sections[0].id,'daily');
  const beforeAgeCards=feed.catalog.length;
  const visibleIds=feed.recommendations.sections.flatMap(section=>section.eventIds);
  assert.equal(new Set(visibleIds).size,visibleIds.length);
  const saved=await api('/location','POST',{lat:55.7558,lng:37.6173});
  for(let check=0;check<2;check++) {
    const read=(await api('/location')).location;
    assert.deepEqual({lat:read.lat,lng:read.lng,at:read.at},{lat:saved.location.lat,lng:saved.location.lng,at:saved.location.at});
    assert.ok(Math.abs(Date.parse(read.expiresAt)-Date.parse(saved.location.expiresAt))<1000);
  }
  const withLocation=await api('/bootstrap');
  const nearby=withLocation.recommendations.sections.find(section=>section.id==='nearby');
  const locatedIds=withLocation.recommendations.sections.flatMap(section=>section.eventIds);
  assert.equal(new Set(locatedIds).size,locatedIds.length);
  const items=withLocation.catalog.filter(event=>nearby.eventIds.includes(event.id));
  assert.ok(items.every(event=>event.distanceKm<=10));
  await api('/location','DELETE',{});
  assert.equal((await api('/location')).location,null);
  console.log(JSON.stringify({ok:true,calibrationCandidates:catalogCount,beforeAgeCards,afterAgeCards:aged.catalog.length,dailyCards:feed.recommendations.daily.ids.length,nearbyCards:items.length}));
} finally {if(newcomer)await api('/me','DELETE',{});}
