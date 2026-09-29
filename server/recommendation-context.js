import { eligibleEvents } from "./domain.js";
import { projectCandidates, eventFeatures } from "./recommendation-v2.js";
import { recommendationView } from "./recommendation.js";

export async function loadRecommendationContext({ user, store, catalogRepository, rawCatalog, city }) {
  const [location, history] = await Promise.all([store.location(user.id), store.interactions(user.id)]);
  const missing = history.filter(item => !Object.keys(item.features || {}).length);
  if (missing.length) {
    const archived = new Map((await catalogRepository.historicalEvents([...new Set(missing.map(item => item.eventId))])).map(event => [event.id, event]));
    for (const item of missing) {
      const event = archived.get(item.eventId);
      if (event) {
        item.features = eventFeatures(event);
        item.featureVersion = 2;
        await store.snapshotInteraction(user.id, item);
      }
    }
  }
  if (user.recommendation) user.recommendation.interactions = history;
  const context = { city: city || user.profile?.city || "Москва", location };
  const age = Number(user.profile?.age);
  const ageKnown = Number.isInteger(age) && age >= 7 && age <= 100;
  const shortCalibration = Array.isArray(user.recommendation?.calibration) && user.recommendation.calibration.length < 6;
  const calibrationPreview = user.interestOnboarded && (!user.onboarded || shortCalibration) && !ageKnown;
  const projected = projectCandidates(rawCatalog, user, { ...context, ignoreAge: calibrationPreview });
  const available = calibrationPreview ? projected : eligibleEvents(projected, user);
  return { location, context, ageKnown, calibrationPreview, projected, available };
}

export async function recommendationsForUser({ user, store, catalogRepository, rawCatalog, city }) {
  const result = await loadRecommendationContext({ user, store, catalogRepository, rawCatalog, city });
  const recommendations = recommendationView(user, result.available, undefined, result.context);
  await store.saveUser(user);
  return { ...result, recommendations };
}
