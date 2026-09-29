export function launchPayload({ bridgeStartParam, hash = "", search = "" } = {}) {
  const bridge = typeof bridgeStartParam === "string" ? bridgeStartParam : "";
  if (bridge) return bridge;
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  return fragment.get("WebAppStartParam") || query.get("WebAppStartParam") || query.get("startapp") || "";
}

export function initialTab({ search = "", payload = "" } = {}) {
  const requested = new URLSearchParams(search.replace(/^\?/, "")).get("tab") ||
    (payload === "tab_map" ? "map" : payload === "tab_plan" || payload === "tab_garden" ? "profile" : "home");
  if (["discover", "together"].includes(requested)) return "home";
  if (["plan", "garden"].includes(requested)) return "profile";
  return ["home", "map", "profile"].includes(requested) ? requested : "home";
}

export function launchEventId(payload = "") {
  return /^e_[a-zA-Z0-9_-]+$/.test(payload) ? payload.slice(2) : "";
}
