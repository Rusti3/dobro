import test from "node:test";
import assert from "node:assert/strict";
import { appButton, locationFromMessage } from "../server/max.js";

test("MAX location attachment is read only with valid coordinates", () => {
  assert.deepEqual(locationFromMessage({ body: { attachments: [{ type: "location", latitude: 55.7558, longitude: 37.6173 }] } }), { lat: 55.7558, lng: 37.6173 });
  assert.deepEqual(locationFromMessage({ body: { attachments: [{ type: "location", payload: { latitude: 55.7558, longitude: 37.6173 } }] } }), { lat: 55.7558, lng: 37.6173 });
  assert.deepEqual(locationFromMessage({ body: { attachments: [{ type: "location", payload: { lat: 55.7558, lon: 37.6173 } }] } }), { lat: 55.7558, lng: 37.6173 });
  assert.equal(locationFromMessage({ body: { attachments: [{ type: "location", payload: { latitude: 120, longitude: 37 } }] } }), null);
  assert.equal(locationFromMessage({ body: { attachments: [{ type: "image", payload: {} }] } }), null);
});

test("location reply uses a MAX mini-app deep link to the map", () => {
  assert.deepEqual(appButton({ text: "Открыть карту", botUsername: "@helpi_bot", appUrl: "https://example.org", payload: "tab_map" }), {
    type: "link",
    text: "Открыть карту",
    url: "https://max.ru/helpi_bot?startapp=tab_map",
  });
});
