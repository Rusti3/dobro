import { createPool } from '../server/database.js';
import { createCatalogRepository } from '../server/catalog-repository.js';
import { createStore } from '../server/store.js';
import { eventFeatures, projectCandidates, recommendationViewV2, effectiveSignals } from '../server/recommendation-v2.js';
import { recommendationViewLegacy, moscowDay } from '../server/recommendation.js';

const pool=createPool({applicationName:'helpi_recommendation_audit'});
try {
  const store=createStore(pool),repository=createCatalogRepository(pool);
  const catalog=await repository.listActive(),users=await store.users();
  const comparisons=[];
  for(const original of users.filter(user=>user.registered && user.onboarded && user.recommendation)) {
    const user=structuredClone(original);
    const history=await store.interactions(user.id);
    user.recommendation.interactions=history;
    const context={city:user.profile.city,location:await store.location(user.id)};
    const candidates=projectCandidates(catalog,user,context);
    const old=recommendationViewLegacy(structuredClone(user),candidates,moscowDay());
    const next=recommendationViewV2(user,candidates,moscowDay(),context);
    const oldIds=old.daily?.ids||[],newIds=next.daily.ids;
    comparisons.push({oldIds,newIds,overlap:newIds.filter(id=>oldIds.includes(id)).length,signals:effectiveSignals(history).length,
      recommendationReasons:candidates.filter(event=>newIds.includes(event.id)).map(event=>event.recommendationReasons),
      selectedVacancies:candidates.filter(event=>newIds.includes(event.id)).map(event=>event.selectedVacancyId)});
  }
  console.log(JSON.stringify({at:new Date().toISOString(),counts:await repository.counts(),
    usersCompared:comparisons.length,comparisons,
    featureCoverage:catalog.filter(event=>event.annotation).length,
    note:'This compares outputs, not causal recommendation quality; outcome metrics need prospective data.'},null,2));
} finally {await pool.end();}
