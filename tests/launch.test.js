import test from "node:test";
import assert from "node:assert/strict";
import { initialTab, launchPayload, launchEventId } from "../src/launch.js";

test("MAX return payload opens the map even when passed through the URL fragment", () => {
  assert.equal(launchPayload({ bridgeStartParam: "tab_map" }), "tab_map");
  assert.equal(launchPayload({ hash: "#WebAppStartParam=tab_map" }), "tab_map");
  assert.equal(launchPayload({ search: "?startapp=tab_map" }), "tab_map");
  assert.equal(initialTab({ payload: "tab_map" }), "map");
  assert.equal(initialTab({ search: "?tab=home", payload: "tab_map" }), "home");
});

test("unknown launch payloads do not turn into tabs or invitation codes", () => {
  assert.equal(initialTab({ payload: "unknown" }), "home");
  assert.equal(initialTab({ payload: "tab_plan" }), "profile");
});

test("daily digest payload selects only a valid event ID", () => {
  assert.equal(launchEventId("e_11597695"), "11597695");
  for (const value of ["i_code", "tab_map", "e_", "e_../profile", "e_1?city=bad"]) assert.equal(launchEventId(value), "");
});
