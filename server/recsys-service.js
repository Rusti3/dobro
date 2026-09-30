import http from 'node:http';
import { eligibleEvents } from './domain.js';
import { projectCandidates, eventFeatures } from './recommendation-v2.js';
import { recommendationView, recordFeedback, resetRecommendation } from './recommendation.js';

const port = Number.parseInt(process.env.RECSYS_PORT || '3211', 10);
const host = process.env.RECSYS_HOST || '127.0.0.1';
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 8_000_000) throw Object.assign(new Error('Payload too large'), { status: 413 });
  }
  return JSON.parse(raw || '{}');
}
const compactUser = user => ({ id: user.id, registered: user.registered, profile: user.profile, interestOnboarded: user.interestOnboarded, onboarded: user.onboarded, recommendation: user.recommendation });

export async function handleRecSys(req, res) {
  if (req.method === 'GET' && req.url === '/health')
    return json(res, 200, { ok: true, service: 'recsys', version: process.env.APP_COMMIT || 'local' });
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const data = await body(req);
    const user = data.user;
    if (!user?.id || !user.profile || !Array.isArray(data.catalog))
      throw Object.assign(new Error('Invalid recommendation request'), { status: 400 });
    if (req.url === '/v1/context') {
      const history = Array.isArray(data.history) ? data.history : [];
      const archived = new Map((data.historicalEvents || []).map(event => [event.id, event]));
      const snapshots = [];
      for (const item of history) if (!Object.keys(item.features || {}).length && archived.has(item.eventId)) {
        item.features = eventFeatures(archived.get(item.eventId));
        item.featureVersion = 2;
        snapshots.push(item);
      }
      if (user.recommendation) user.recommendation.interactions = history;
      const context = { city: data.city || user.profile.city || 'Москва', location: data.location || null };
      const age = Number(user.profile.age);
      const ageKnown = Number.isInteger(age) && age >= 7 && age <= 100;
      const shortCalibration = Array.isArray(user.recommendation?.calibration) && user.recommendation.calibration.length < 6;
      const calibrationPreview = user.interestOnboarded && (!user.onboarded || shortCalibration) && !ageKnown;
      const projected = projectCandidates(data.catalog, user, { ...context, ignoreAge: calibrationPreview });
      const available = calibrationPreview ? projected : eligibleEvents(projected, user);
      return json(res, 200, { user: compactUser(user), context, ageKnown, calibrationPreview, projected, available, snapshots });
    }
    if (req.url === '/v1/view') {
      const recommendations = recommendationView(user, data.catalog, data.day, data.context || {});
      return json(res, 200, { user: compactUser(user), recommendations });
    }
    if (req.url === '/v1/feedback') {
      const before = user.recommendation?.interactions?.length || 0;
      recordFeedback(user, data.catalog, data.feedback, data.day);
      return json(res, 200, { user: compactUser(user), interaction: user.recommendation.interactions.length > before ? user.recommendation.interactions.at(-1) : null });
    }
    if (req.url === '/v1/reset') {
      resetRecommendation(user, data.catalog, data.interests || []);
      return json(res, 200, { user: compactUser(user) });
    }
    if (req.url === '/v1/project')
      return json(res, 200, { candidates: projectCandidates(data.catalog, user, data.context || {}) });
    if (req.url === '/v1/features')
      return json(res, 200, { features: data.catalog.map(event => ({ id: event.id, features: eventFeatures(event) })) });
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status
      : /^(Некорректная реакция|Это дело больше недоступно)/.test(error.message) ? 400 : 500;
    if (status === 500) console.error('RecSys request failed:', error);
    return json(res, status, { error: status === 500 ? 'Recommendation service error' : error.message });
  }
}

if (process.argv[1]?.endsWith('recsys-service.js'))
  http.createServer(handleRecSys).listen(port, host, () => console.log(JSON.stringify({ service: 'recsys', host, port })));
