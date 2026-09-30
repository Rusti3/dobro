import { recsys } from './recsys-client.js';

export async function loadRecommendationContext({ user, store, catalogRepository, rawCatalog, city }) {
  const [location, history] = await Promise.all([store.location(user.id), store.interactions(user.id)]);
  const missing = history.filter(item => !Object.keys(item.features || {}).length);
  const historicalEvents = missing.length
    ? await catalogRepository.historicalEvents([...new Set(missing.map(item => item.eventId))]) : [];
  const result = await recsys('context', { user, catalog: rawCatalog, history, historicalEvents, location, city });
  Object.assign(user, result.user);
  for (const item of result.snapshots) await store.snapshotInteraction(user.id, item);
  return { location, context: result.context, ageKnown: result.ageKnown, calibrationPreview: result.calibrationPreview, projected: result.projected, available: result.available };
}

export async function recommendationsForUser({ user, store, catalogRepository, rawCatalog, city }) {
  const result = await loadRecommendationContext({ user, store, catalogRepository, rawCatalog, city });
  const view = await recsys('view', { user, catalog: result.available, context: result.context });
  Object.assign(user, view.user);
  await store.saveUser(user);
  return { ...result, recommendations: view.recommendations };
}
