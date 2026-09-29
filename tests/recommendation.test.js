import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../data/catalog.json" with { type: "json" };
import { applyFeedback, calibrationBatch, eventVector, initialVector, recommendationView, recordFeedback, resetRecommendation } from "../server/recommendation.js";

test("interest choices seed the preference vector and calibration stays diverse", () => {
  const interests = ["animals", "ecology", "nature", "city", "children"];
  const vector = initialVector(interests);
  assert.equal(vector.theme_animals, 0.6);
  assert.equal(vector.theme_donation, 0.12);
  const batch = calibrationBatch(catalog, vector, interests, "test-user");
  assert.equal(batch.length, 6);
  assert.equal(new Set(batch.map((item) => item.id)).size, 6);
  assert.ok(new Set(batch.map((item) => item.theme)).size >= 4);
});

test("likes and skips move event and format weights in opposite directions", () => {
  const event = catalog.find((item) => item.theme === "animals");
  const base = initialVector(["animals", "ecology", "nature", "city", "children"]);
  const liked = applyFeedback(base, event, "like");
  const skipped = applyFeedback(base, event, "skip");
  const formatDimension = Object.keys(eventVector(event)).find((key) => key.startsWith("format_") && eventVector(event)[key]);
  assert.ok(liked.theme_animals > base.theme_animals);
  assert.ok(skipped.theme_animals < base.theme_animals);
  assert.ok(liked[formatDimension] > base[formatDimension]);
});

test("six calibration reactions unlock a daily feed with recommendations first", () => {
  const user = { id: "u1", profile: { interests: [] } };
  resetRecommendation(user, catalog, ["animals", "ecology", "nature", "city", "children"]);
  for (const item of user.recommendation.calibration) recordFeedback(user, catalog, { eventId: item.id, action: "like", context: "calibration" }, "2026-09-19");
  assert.equal(user.onboarded, true);
  const view = recommendationView(user, catalog, "2026-09-19");
  assert.equal(view.stage, "feed");
  assert.equal(view.daily.ids.length, 4);
  assert.equal(new Set(view.daily.ids).size, 4);
  assert.equal(view.sections[0].id, "daily");
  assert.deepEqual(view.sections[0].eventIds, view.daily.ids);
  assert.ok(view.sections.length >= 5);
});

test("a two-card calibration is extended for an existing age-free profile without losing reactions", () => {
  const available=catalog.filter(item=>!item.endsAt||Date.parse(item.endsAt)>Date.now());
  const user={id:'short-calibration',registered:true,profile:{age:null,interests:[]}};
  resetRecommendation(user,available.slice(0,2),['animals']);
  const original=user.recommendation.calibration.map(item=>item.id);
  for(const item of user.recommendation.calibration) recordFeedback(user,available.slice(0,2),{eventId:item.id,action:'like',context:'calibration'});
  assert.equal(user.onboarded,true);
  const view=recommendationView(user,available);
  assert.equal(view.stage,'calibration');
  assert.equal(view.target,6);
  assert.equal(view.completed,2);
  assert.deepEqual(view.items.slice(0,2).map(item=>item.id),original);
  assert.equal(new Set(view.items.map(item=>item.id)).size,6);
});

test("an in-progress twelve-card journey ends after the sixth choice without losing history", () => {
  const user = { id: "legacy-calibration", profile: { age: 23, interests: [] } };
  resetRecommendation(user, catalog, ["animals"]);
  const firstSix = [...user.recommendation.calibration];
  for (const item of user.recommendation.calibration.slice(0, 5))
    recordFeedback(user, catalog, { eventId: item.id, action: "like", context: "calibration" });
  user.recommendation.calibration = [...firstSix, ...catalog.filter(item => !firstSix.some(chosen => chosen.id === item.id)).slice(0, 6).map(item => ({ id: item.id, theme: item.theme }))];
  const before = user.recommendation.interactions.length;
  const view = recommendationView(user, catalog);
  assert.equal(view.stage, "calibration");
  assert.equal(view.target, 6);
  assert.equal(view.completed, 5);
  assert.equal(user.recommendation.interactions.length, before);
  recordFeedback(user, catalog, { eventId: view.items[5].id, action: "skip", context: "calibration" });
  assert.equal(recommendationView(user, catalog).stage, "feed");
});

test("a plan and a completed visit are stronger positive signals", () => {
  const user = { id: "u2", profile: { interests: [] } };
  resetRecommendation(user, catalog, ["animals", "ecology", "nature", "city", "children"]);
  const event = catalog.find((item) => item.theme === "animals");
  const before = user.recommendation.vector.theme_animals;
  recordFeedback(user, catalog, { eventId: event.id, action: "like", context: "plan" }, "2026-09-19");
  const planned = user.recommendation.vector.theme_animals;
  recordFeedback(user, catalog, { eventId: event.id, action: "like", context: "visit" }, "2026-09-20");
  assert.ok(planned - before >= 0.35);
  assert.ok(user.recommendation.vector.theme_animals > planned);
});
