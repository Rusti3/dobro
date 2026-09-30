import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../data/catalog.json" with { type: "json" };
import { botMessageBody, botRecommendations, dailyDigestPanel } from "../server/bot-service.js";
import { processUpdate } from "../server/max.js";
import http from 'node:http';
import { handleRecSys } from '../server/recsys-service.js';

function fixture() {
  const user = { id: "max:12345", name: "Анна", registered: true, interestOnboarded: true, onboarded: true,
    reminders: true, profile: { age: 25, city: "Москва", interests: ["animals"] }, botDialog: { step: "age" } };
  const calls = [];
  const store = { user: async () => user, location: async () => null, interactions: async () => [],
    snapshotInteraction: async () => {}, saveUser: async () => {},
    plans: async () => { throw new Error("Chat must not access plans"); },
    savePlan: async () => { throw new Error("Chat must not create plans"); },
    saveInteraction: async () => { throw new Error("Chat must not create reactions"); },
    deleteUser: async () => { throw new Error("Chat must not delete accounts"); },
  };
  return { user, calls, options: { store, catalog, catalogRepository: { historicalEvents: async () => [] },
    appUrl: "https://helpi.example", botUsername: "helpi_bot", token: "test",
    call: async (...args) => { calls.push(args); return { success: true }; } } };
}

test("removed commands only link to mini-app, without plans, reactions or profile dialogs", async () => {
  for (const text of ["/plan", "/nearby", "/deals", "/profile", "/garden", "/invite", "/delete", "26"]) {
    const { user, calls, options } = fixture();
    await processUpdate({ ...options, update: { update_type: "message_created",
      message: { sender: { user_id: 12345 }, body: { text } } } });
    assert.equal(user.profile.age, 25);
    assert.equal(user.botDialog, null);
    assert.equal(calls.length, 1);
    const body = calls[0][2].payload;
    assert.match(body.text, /только ежедневные рекомендации/);
    assert.deepEqual(body.attachments[0].payload.buttons.flat().map(x => x.type), ["open_app"]);
  }
});

test("old callback buttons no longer execute their actions", async () => {
  for (const action of ["h:profile", "h:add:1", "h:like:1", "h:invite-event:1", "h:nearby"]) {
    const { user, calls, options } = fixture();
    await processUpdate({ ...options, update: { update_type: "message_callback",
      callback: { callback_id: "cb1", payload: action, user: { user_id: 12345 } } } });
    assert.equal(calls[0][1], "/answers");
    assert.match(calls[0][2].payload.message.text, /мини-приложении/);
    assert.equal(user.profile.age, 25);
    assert.equal(user.botDialog, null);
  }
});

test("start and stop only control daily delivery", async () => {
  const { user, options } = fixture();
  for (const [text, enabled] of [["/stop", false], ["/start", true]]) {
    await processUpdate({ ...options, update: { update_type: "message_created",
      message: { sender: { user_id: 12345 }, body: { text } } } });
    assert.equal(user.dailyDigest, enabled);
    assert.equal(user.reminders, true);
  }
  await processUpdate({ ...options, update: { update_type: "bot_stopped", user: { user_id: 12345 } } });
  assert.equal(user.dailyDigest, false);
  assert.equal(user.botConnected, false);
  assert.equal(user.chatId, null);
});

test("mini-app geolocation bridge still persists the point and returns to the map", async () => {
  const { user, calls, options } = fixture();
  user.locationRequestAt = new Date().toISOString();
  let saved;
  options.store.setLocation = async (_, point) => { saved = point; };
  await processUpdate({ ...options, update: { update_type: "message_created",
    message: { sender: { user_id: 12345 }, body: { attachments: [{ type: "location", payload: { latitude: 55.75, longitude: 37.61 } }] } } } });
  assert.deepEqual(saved, { lat: 55.75, lng: 37.61 });
  assert.equal(calls[0][2].payload.attachments[0].payload.buttons[0][0].payload, "tab_map");
});

test("daily digest uses shared recommender and opens events in mini-app without chat callbacks", async t => {
  const service = http.createServer(handleRecSys);
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  const previous = process.env.RECSYS_URL;
  process.env.RECSYS_URL = `http://127.0.0.1:${service.address().port}`;
  t.after(async () => { process.env.RECSYS_URL = previous; await new Promise(resolve => service.close(resolve)); });
  const { user, options } = fixture();
  const result = await botRecommendations({ ...options, user });
  assert.equal(result.recommendations.stage, "feed");
  const ids = result.recommendations.sections.find(x => x.id === "daily").eventIds;
  const events = ids.map(id => result.available.find(x => x.id === id));
  const digest = dailyDigestPanel(events, options);
  assert.ok(events.length > 0);
  assert.ok(digest.buttons.length <= 4);
  for (const [index, row] of digest.buttons.entries()) {
    assert.equal(row[0].type, "open_app");
    assert.equal(row[0].payload, `e_${events[index].id}`);
  }
  assert.equal(botMessageBody(digest).attachments.length, 1);
  const browser = dailyDigestPanel([{ id: "1", short: "Приют" }], { appUrl: "https://helpi.example" });
  assert.equal(browser.buttons[0][0].url, "https://helpi.example/?startapp=e_1");
  assert.equal(dailyDigestPanel([], options), null);
});
