import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, MapPin, X } from "lucide-react";
import { api, maxInitData as getMaxInitData } from './api.js';

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const status = (event, now = Date.now()) => {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "upcoming";
  if (now < start) return "upcoming";
  return now < end ? "live" : "ended";
};

const statusLabel = (event) => {
  const value = status(event);
  if (value === "live") return "идёт сейчас";
  if (value === "ended") return "завершено";
  return "скоро начнётся";
};

const hasRealCoordinates = (event) => Number.isFinite(event.lat)
  && Number.isFinite(event.lng)
  && event.lat >= -90
  && event.lat <= 90
  && event.lng >= -180
  && event.lng <= 180
  && !(event.lat === 0 && event.lng === 0);

const toGeoJSON = (events) => ({
  type: "FeatureCollection",
  features: events
    .filter(hasRealCoordinates)
    .map((event) => ({
      type: "Feature",
      id: event.id,
      geometry: { type: "Point", coordinates: [event.lng, event.lat] },
      properties: { id: event.id },
    })),
});

export default function VolunteerMap({ events, onSelect, center = [37.6173, 55.7558], botUsername, userName = "Друг", userPhotoUrl = null }) {
  const host = useRef(null);
  const map = useRef(null);
  const pins = useRef(new Map());
  const latest = useRef({ events, onSelect, center });
  latest.current = { events, onSelect, center };
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [nearby, setNearby] = useState(null);
  const [locationPending, setLocationPending] = useState(false);
  const maxInitData = getMaxInitData();

  useEffect(() => {
    if (!host.current) return undefined;
    let disposed = false;
    let pinsDirty = true;
    let pendingSelection = null;
    let instance;

    try {
      instance = new maplibregl.Map({
        container: host.current,
        center,
        zoom: 10.5,
        maxZoom: 19,
        minZoom: 3,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        dragRotate: false,
        pitchWithRotate: false,
        style: "/map/bright.json",
        canvasContextAttributes: { antialias: true },
      });
    } catch {
      setError("Не удалось открыть карту. Добрые дела доступны в ленте.");
      return undefined;
    }

    map.current = instance;
    instance.on("error", () => {
      if (!disposed)
        setError("Не удалось загрузить карту. Проверь подключение к интернету.");
    });

    function focusAndSelect(event) {
      const current = latest.current.events.find((item) => item.id === event.id);
      if (!current) return;
      const token = Symbol(current.id);
      pendingSelection = token;
      instance.stop();
      instance.once("moveend", () => {
        if (disposed || pendingSelection !== token) return;
        pendingSelection = null;
        const selected = latest.current.events.find(
          (item) => item.id === current.id,
        );
        if (selected) latest.current.onSelect(selected);
      });
      instance.easeTo({
        center: [current.lng, current.lat],
        zoom: Math.max(instance.getZoom(), 15),
        duration: 700,
        easing: (progress) => 1 - Math.pow(1 - progress, 4),
      });
    }

    function syncPins() {
      if (
        disposed ||
        !pinsDirty ||
        !instance.getSource("events") ||
        !instance.isSourceLoaded("events")
      )
        return;
      pinsDirty = false;
      const features = instance.querySourceFeatures("events");
      const eventsById = new Map(
        latest.current.events.map((event) => [event.id, event]),
      );
      const visible = new Set();

      for (const feature of features) {
        const cluster = Boolean(feature.properties.cluster);
        const id = cluster
          ? `cluster:${feature.properties.cluster_id}`
          : `event:${feature.properties.id}`;
        if (visible.has(id)) continue;
        const event = cluster ? null : eventsById.get(feature.properties.id);
        if (!cluster && !event) continue;
        const coordinates = cluster
          ? feature.geometry.coordinates
          : [event.lng, event.lat];
        visible.add(id);
        const existing = pins.current.get(id);

        if (existing) {
          if (
            existing.coordinates[0] !== coordinates[0] ||
            existing.coordinates[1] !== coordinates[1]
          ) {
            existing.marker.setLngLat(coordinates);
            existing.coordinates = coordinates;
          }
          if (cluster && existing.count !== feature.properties.point_count) {
            existing.element.textContent = String(feature.properties.point_count);
            existing.element.setAttribute(
              "aria-label",
              `Приблизить группу: ${feature.properties.point_count} добрых дел`,
            );
            existing.count = feature.properties.point_count;
          }
          continue;
        }

        const element = document.createElement("button");
        element.type = "button";
        if (cluster) {
          element.className = "map-cluster";
          element.textContent = String(feature.properties.point_count);
          element.setAttribute(
            "aria-label",
            `Приблизить группу: ${feature.properties.point_count} добрых дел`,
          );
          element.onclick = () => {
            if (disposed || !instance.isSourceLoaded("events")) return;
            instance
              .getSource("events")
              .getClusterExpansionZoom(feature.properties.cluster_id)
              .then((zoom) => {
                if (!disposed)
                  instance.easeTo({ center: coordinates, zoom, duration: 550 });
              })
              .catch(() => {});
          };
        } else {
          const eventStatus = status(event);
          element.className = `map-event-pin ${eventStatus}`;
          element.textContent = eventStatus === "live" ? "ДЕЛО" : "●";
          element.setAttribute(
            "aria-label",
            `${event.short || event.title}. ${statusLabel(event)}`,
          );
          element.onclick = (click) => {
            click.stopPropagation();
            focusAndSelect(event);
          };
        }

        const marker = new maplibregl.Marker({
          element,
          anchor: "bottom",
          subpixelPositioning: true,
        })
          .setLngLat(coordinates)
          .addTo(instance);
        pins.current.set(id, {
          marker,
          element,
          coordinates,
          count: feature.properties.point_count,
          eventId: cluster ? null : feature.properties.id,
        });
      }

      for (const [id, pin] of pins.current) {
        if (!visible.has(id)) {
          pin.marker.remove();
          pins.current.delete(id);
        }
      }
    }

    function addEventLayer() {
      if (disposed || instance.getSource("events")) return;
      instance.addSource("events", {
        type: "geojson",
        data: toGeoJSON(latest.current.events),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 48,
      });
      instance.addLayer({
        id: "event-points",
        type: "circle",
        source: "events",
        paint: { "circle-radius": 1, "circle-opacity": 0 },
      });
      setReady(true);
      syncPins();
    }

    instance.on("load", addEventLayer);
    instance.on("style.load", addEventLayer);
    instance.on("move", () => {
      pinsDirty = true;
    });
    instance.on("sourcedata", (event) => {
      if (event.sourceId === "events") pinsDirty = true;
    });
    instance.on("render", syncPins);
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(host.current);

    return () => {
      disposed = true;
      pendingSelection = null;
      resize.disconnect();
      pins.current.forEach((pin) => pin.marker.remove());
      pins.current.clear();
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current?.getSource("events")) return;
    map.current.getSource("events").setData(toGeoJSON(events));
  }, [events, ready]);

  useEffect(() => {
    if (!ready || !map.current || !nearby) return undefined;
    const avatar = document.createElement("div");
    avatar.className = "map-user-avatar";
    avatar.textContent = (String(userName || "").trim()[0] || "Я").toLocaleUpperCase("ru-RU");
    avatar.title = "Ваше местоположение";
    if (userPhotoUrl) {
      const image = document.createElement("img");
      image.src = userPhotoUrl;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.onerror = () => image.remove();
      avatar.append(image);
    }
    const marker = new maplibregl.Marker({ element: avatar, anchor: "center" })
      .setLngLat([nearby.lng, nearby.lat])
      .addTo(map.current);
    map.current.easeTo({ center: [nearby.lng, nearby.lat], zoom: 12 });
    return () => marker.remove();
  }, [nearby, ready, userName, userPhotoUrl]);

  useEffect(() => {
    let disposed = false;
    async function checkLocation() {
      try {
        const result = await api('/location');
        if (disposed) return;
        if (result.location) {
          setNearby(previous=>previous?.at===result.location.at?previous:result.location);
          setLocationPending(false);
          setError("");
        } else { setNearby(null); setLocationPending(result.pending); }
      } catch { /* The map stays usable if MAX is temporarily offline. */ }
    }
    checkLocation();
    const interval = setInterval(checkLocation, locationPending ? 3000 : 30000);
    document.addEventListener("visibilitychange", checkLocation);
    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", checkLocation);
    };
  }, [maxInitData, botUsername, locationPending]);

  async function locate() {
    if (maxInitData && botUsername) {
      setLocating(true);
      setError("");
      try {
        const result = await api('/location/request','POST',{});
        setLocationPending(true);
        setError("Открой чат с ботом и нажми «Поделиться геопозицией». Затем вернись на карту.");
        window.WebApp.openMaxLink?.(`https://max.ru/${result.botUsername.replace(/^@/, "")}`);
      } catch (error) {
        setError(error.message);
      } finally {
        setLocating(false);
      }
      return;
    }
    if (!navigator.geolocation) {
      setError("Геопозиция недоступна в этом браузере.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
        const result=await api('/location','POST',{
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setNearby(result.location);
        } catch(error) { setError(error.message); }
        finally { setLocating(false); }
      },
      () => {
        setLocating(false);
        setError(
          "Не удалось определить местоположение. Разреши геопозицию в настройках MAX.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  return (
    <div className="map-wrapper">
      <div
        ref={host}
        className="event-map"
        aria-label="Интерактивная карта добрых дел"
      />
      <div className="map-actions">
        <button onClick={locate} disabled={locating}>
          <LocateFixed size={16} />
          {locating ? "Запрашиваем…" : locationPending ? "Открыть чат MAX" : nearby ? "Обновить геопозицию" : "Что рядом"}
        </button>
        {nearby && (
          <button
            onClick={async () => { try { await api('/location','DELETE',{}); setNearby(null); setLocationPending(false); } catch(error) { setError(error.message); } }}
            aria-label="Убрать мою геопозицию"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {error && (
        <div className="map-error" role="status">
          <MapPin size={16} /> {error}
        </div>
      )}
    </div>
  );
}
