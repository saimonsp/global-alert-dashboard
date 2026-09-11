import { fetchEarthquakes, fetchStorms, fetchVolcanoes } from "./api.js";
import { initMap, renderMap, focusEvent, fitWorld, invalidateMapSize, setMapStyle, getMarkerScale, isHeatOverlayEnabled, BRAZIL_BOUNDS_LATLNG } from "./map.js";
import { filterEvents, formatTime, FLOOD_TYPES, isCriticalEvent } from "./utils.js";
import { buildGridPoints, mergeRegionalWinds, WORLD_WIND_CITIES } from "./winds.js";
import { buildClimateExtremes, fetchInmetWindAndRain, fetchWindAndRain, mergeRegionalRain, WORLD_WEATHER_POINTS } from "./rain.js";
import { fetchFloodData, filterFloodEvents } from "./floods.js";
import { fetchKpIndex, fetchSolarActivity } from "./solar.js";
import { fetchFires, shouldPollFires } from "./fires.js";
import { fetchCivilDefenseAlerts, shouldPollCivilDefense } from "./cemaden.js";
import { initAlertSystem, checkRegionalAlerts, playAlarm, sendNotification, getUserLocation, setSoundEnabled } from "./alerts.js";
import { trackCall, checkQuotaReset } from "./quota.js";
import { elements, readFilters, refreshIcons, renderAlerts, renderBulletin, renderClimateExtremes, renderSolar, renderStats, setApiStatus, setLoading } from "./ui.js";
import { initTvMode } from "./tv.js";
import { initSettings, getSettings, onSettingsChange } from "./settings.js";
import { initOfflineSources } from "./offline-sources.js";

const state = {
  earthquakes: [],
  storms: [],
  winds: [],
  rains: [],
  floods: [],
  fires: [],
  volcanoes: [],
  civilDefense: [],
  offline: [],
  climateExtremes: null,
  solar: null,
  selectedEvent: null,
  filters: {
    earthquakes: false,
    storms: false,
    winds: false,
    rain: false,
    floods: false,
    fires: false,
    volcanoes: false,
    civilDefense: false,
    minMagnitude: 2.5,
    period: "24h"
  },
  lastUpdate: null,
  apiStatus: {
    usgs: "idle",
    eonet: "idle",
    weather: "idle",
    winds: "idle",
    rain: "idle",
    inmet: "idle",
    solar: "idle",
    floods: "idle",
    fires: "idle",
    volcanoes: "idle",
    civilDefense: "idle"
  }
};

let earthquakeTimer = null;
let stormTimer = null;
let weatherTimer = null;
let solarTimer = null;
let floodTimer = null;
let volcanoTimer = null;
let civilDefenseTimer = null;
let map = null;
let zoomDebounce = null;
let tvApi = null;
let lastKnownEventIds = new Set();
let offlineApi = null;

function visibleEvents() {
  return filterEvents(
    [...state.earthquakes, ...state.storms, ...state.winds, ...state.rains, ...state.floods, ...state.fires, ...state.volcanoes, ...state.civilDefense, ...state.offline],
    state.filters
  );
}

function render() {
  const events = visibleEvents();
  renderMap(events);
  renderStats(events, state.lastUpdate ? formatTime(state.lastUpdate) : null);
  renderAlerts(events, event => {
    state.selectedEvent = event;
    focusEvent(event);
  });
  renderBulletin(state.earthquakes, event => {
    state.selectedEvent = event;
    focusEvent(event);
  });
  renderClimateExtremes(state.climateExtremes);
  renderSolar(state.solar);
  refreshIcons();
  updateCriticalBanner(events);
  trackNewEvents(events);
  checkAndAlertRegional(events);
  tvApi?.sync(events, state.lastUpdate);
}

function checkAndAlertRegional(events) {
  const regional = checkRegionalAlerts(events);
  regional.forEach(event => {
    playAlarm(event);
    sendNotification(event);
  });
}

function updateCriticalBanner(events) {
  const banner = elements.criticalBanner;
  if (!banner) return;
  const critical = events.filter(isCriticalEvent);
  if (!critical.length) {
    banner.classList.add("hidden");
    banner.replaceChildren();
    return;
  }
  banner.classList.remove("hidden");
  banner.replaceChildren();
  const tag = document.createElement("strong");
  tag.textContent = "ALERTAS CRITICOS";
  banner.append(tag);
  critical.slice(0, 5).forEach(event => {
    const span = document.createElement("span");
    if (event.type === "earthquake") span.textContent = `Terremoto M${event.magnitude.toFixed(1)} - ${event.place}`;
    else if (event.type === "wind") span.textContent = `Vento ${event.windSpeed.toFixed(0)} km/h - ${event.place}`;
    else if (event.type === "rain") span.textContent = `Chuva ${event.precipitation.toFixed(1)} mm/h - ${event.place}`;
    else if (event.type === "storm") span.textContent = event.title;
    else if (event.type === "volcano") span.textContent = `Vulcao ${event.title} - ${event.alertLevel}`;
    else if (event.type === "river_flood") span.textContent = `Rio ${event.river || event.name} - risco ${event.riskLevel}`;
    else if (event.type === "flood_risk") span.textContent = `Risco enchente - ${event.rain24h?.toFixed(1) || 0}mm/24h`;
    banner.append(span);
  });
}

function trackNewEvents(events) {
  const currentIds = new Set(events.map(e => e.id));
  if (lastKnownEventIds.size > 0) {
    const newEvents = events.filter(e => !lastKnownEventIds.has(e.id));
    if (newEvents.length) {
      const badge = elements.newEventsBadge;
      if (badge) {
        badge.textContent = `+${newEvents.length} novos`;
        badge.classList.remove("hidden");
        setTimeout(() => badge.classList.add("hidden"), 8000);
      }
      const criticalNew = newEvents.filter(isCriticalEvent);
      if (criticalNew.length && getSettings().notifications) {
        notifyCriticalEvents(criticalNew);
      }
    }
  }
  lastKnownEventIds = currentIds;
}

function notifyCriticalEvents(events) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  events.slice(0, 3).forEach(event => {
    let title = "Alerta Critico";
    let body = "";
    if (event.type === "earthquake") { title = `Terremoto M${event.magnitude.toFixed(1)}`; body = `${event.place} · profundidade ${event.depth != null ? Math.round(event.depth) + "km" : "?"}`; }
    else if (event.type === "wind") { title = "Vento Severo"; body = `${event.windSpeed.toFixed(0)} km/h - ${event.place}`; }
    else if (event.type === "rain") { title = "Chuva Intensa"; body = `${event.precipitation.toFixed(1)} mm/h - ${event.place}`; }
    else if (event.type === "storm") { title = "Tempestade"; body = event.title; }
    else if (event.type === "volcano") { title = `Vulcao ${event.alertLevel}`; body = `${event.title} · ${event.country || event.region || ""}`; }
    else if (FLOOD_TYPES.has(event.type)) { title = "Enchente"; body = `${event.name || event.place} - risco ${event.riskLevel}`; }
    try { new Notification(title, { body, icon: "favicon.ico", tag: event.id }); } catch {}
  });
}

async function updateEarthquakes() {
  setApiStatus("usgs", "loading");
  try {
    const { events, source } = await fetchEarthquakes(state.filters.period);
    trackCall("usgs");
    state.earthquakes = events;
    setApiStatus("usgs", "online", source === "EMSC" ? "via EMSC" : "USGS");
  } catch (error) {
    console.warn("Fontes de terremotos indisponiveis:", error?.message || error);
    setApiStatus("usgs", "error");
  }
}

async function updateStorms() {
  setApiStatus("eonet", "loading");
  try {
    const { events, source } = await fetchStorms();
    trackCall("eonet");
    state.storms = events;
    setApiStatus("eonet", "online", source === "GDACS" ? "via GDACS" : "NASA EONET");
  } catch (error) {
    console.warn("Fontes de tempestades indisponiveis:", error?.message || error);
    setApiStatus("eonet", "error");
  }
}

async function updateVolcanoes() {
  setApiStatus("volcanoes", "loading");
  try {
    const { events, source } = await fetchVolcanoes();
    trackCall("volcanoes");
    state.volcanoes = events;
    setApiStatus("volcanoes", "online", source);
  } catch (error) {
    console.warn("Fonte de vulcoes indisponivel:", error?.message || error);
    setApiStatus("volcanoes", "error");
  }
}

async function updateWeather(force = false) {
  if (!force && Date.now() - lastWeatherFetch < WEATHER_CACHE_TTL_MS) return;
  if (state.filters.winds) setApiStatus("winds", "loading");
  if (state.filters.rain) setApiStatus("rain", "loading");
  if (state.filters.floods) setApiStatus("floods", "loading");
  try {
    const { winds, rains, observations } = await fetchWindAndRain(WORLD_WEATHER_POINTS);
    trackCall("weather");
    state.winds = state.filters.winds ? winds : [];
    state.rains = state.filters.rain ? rains : [];
    state.climateExtremes = buildClimateExtremes(observations);
    lastWeatherFetch = Date.now();
    const source = winds[0]?.source || rains[0]?.source || "Open-Meteo";
    const detail = source !== "Open-Meteo" ? `via ${source}` : "";
    setApiStatus("weather", "online", detail);
    if (state.filters.winds) setApiStatus("winds", "online", detail);
    if (state.filters.rain) setApiStatus("rain", "online", detail);

    if (state.filters.floods) {
      const { rivers, risks } = await fetchFloodData(observations);
      trackCall("floods");
      state.floods = filterFloodEvents([...rivers, ...risks], "low");
      setApiStatus("floods", "online");
    }
  } catch (error) {
    markOpenMeteoBlock(error);
    const isRateLimit = error?.status === 429;
    const isBlocked = !openMeteoAvailable();
    if (!isRateLimit && !isBlocked) {
      console.warn("Fontes meteorologicas indisponiveis:", error?.message || error);
    }
    setApiStatus("weather", isRateLimit ? "idle" : "error");
    if (state.filters.winds) setApiStatus("winds", isRateLimit ? "idle" : "error");
    if (state.filters.rain) setApiStatus("rain", isRateLimit ? "idle" : "error");
    if (state.filters.floods) setApiStatus("floods", isRateLimit ? "idle" : "error");
  }
}

async function updateSolar() {
  setApiStatus("solar", "loading");
  const [kpResult, flareResult] = await Promise.allSettled([fetchKpIndex(), fetchSolarActivity()]);
  trackCall("solar");
  state.solar = {
    kp: kpResult.status === "fulfilled" ? kpResult.value : null,
    flares: flareResult.status === "fulfilled" ? flareResult.value : null
  };
  const online = Boolean(state.solar.kp || state.solar.flares);
  setApiStatus("solar", online ? "online" : "error");
}

async function updateFires() {
  if (!shouldPollFires() && state.fires.length > 0) return;
  setApiStatus("fires", "loading");
  try {
    const fires = await fetchFires();
    state.fires = fires;
    setApiStatus("fires", fires.length > 0 ? "online" : "idle");
    trackCall("fires");
  } catch {
    setApiStatus("fires", "error");
  }
}

async function updateCivilDefense() {
  if (!shouldPollCivilDefense() && state.civilDefense.length > 0) return;
  setApiStatus("civilDefense", "loading");
  try {
    const alerts = await fetchCivilDefenseAlerts();
    state.civilDefense = alerts;
    setApiStatus("civilDefense", alerts.length > 0 ? "online" : "idle");
    trackCall("civilDefense");
  } catch {
    setApiStatus("civilDefense", "error");
  }
}

const isInBrazilView = bounds => bounds.intersects(BRAZIL_BOUNDS_LATLNG);
const INMET_COOLDOWN_MS = 60 * 60 * 1000;
const OPEN_METEO_COOLDOWN_MS = 30 * 60 * 1000;
const OPEN_METEO_DAILY_BLOCK_MS = 2 * 60 * 60 * 1000;
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const REGIONAL_DEBOUNCE_MS = 1500;
const REGIONAL_COOLDOWN_MS = 5 * 60 * 1000;
let inmetBlockedUntil = 0;
let openMeteoBlockedUntil = 0;
let lastWeatherFetch = 0;
let lastRegionalFetch = 0;

function markOpenMeteoBlock(error) {
  if (error?.status === 429) {
    openMeteoBlockedUntil = Date.now() + OPEN_METEO_DAILY_BLOCK_MS;
    console.warn("Open-Meteo: cota diaria excedida (429). Nova tentativa em 1 hora.");
  }
}

function openMeteoAvailable() {
  return Date.now() >= openMeteoBlockedUntil;
}

async function fetchRegionalWeather(bounds, zoom) {
  if (isInBrazilView(bounds) && Date.now() >= inmetBlockedUntil) {
    try {
      setApiStatus("inmet", "loading");
      const observations = await fetchInmetWindAndRain();
      trackCall("inmet");
      setApiStatus("inmet", "online");
      return observations;
    } catch (error) {
      const reason = error?.message || "desconhecido";
      const isDown = !error?.status || error.status === 0;
      console.warn(`INMET indisponivel (${reason}), usando fallback meteorologico`);
      inmetBlockedUntil = Date.now() + (isDown ? INMET_COOLDOWN_MS * 2 : INMET_COOLDOWN_MS);
      setApiStatus("inmet", "error");
    }
  }
  const result = await fetchWindAndRain(buildGridPoints(bounds, zoom));
  trackCall("weather");
  return result;
}

async function updateRegionalData() {
  if (!map || (!state.filters.winds && !state.filters.rain)) return;
  if (Date.now() - lastRegionalFetch < REGIONAL_COOLDOWN_MS) return;
  const bounds = map.getBounds();
  const zoom = map.getZoom();

  try {
    const { winds, rains } = await fetchRegionalWeather(bounds, zoom);
    if (state.filters.winds) state.winds = mergeRegionalWinds(state.winds, winds);
    if (state.filters.rain) state.rains = mergeRegionalRain(state.rains, rains);
    const source = winds[0]?.source || rains[0]?.source || "";
    const detail = source ? `via ${source}` : "";
    setApiStatus("winds", state.filters.winds ? "online" : "idle", detail);
    setApiStatus("rain", state.filters.rain ? "online" : "idle", detail);
    lastRegionalFetch = Date.now();
  } catch (error) {
    markOpenMeteoBlock(error);
    const isRateLimit = error?.status === 429;
    if (!isRateLimit) {
      console.warn("Dados regionais indisponiveis:", error?.message);
    }
    if (state.filters.winds) setApiStatus("winds", isRateLimit ? "idle" : "error");
    if (state.filters.rain) setApiStatus("rain", isRateLimit ? "idle" : "error");
  }

  render();
  scheduleAutoRetry();
}

function scheduleRegionalUpdate() {
  clearTimeout(zoomDebounce);
  zoomDebounce = setTimeout(() => {
    if (state.filters.winds || state.filters.rain) updateRegionalData();
  }, REGIONAL_DEBOUNCE_MS);
}

function failedSourceNames() {
  const labels = {
    usgs: ["USGS", elements.statusUsgs],
    eonet: ["NASA EONET", elements.statusEonet],
    solar: ["NOAA SWPC (solar)", elements.statusSolar],
    volcanoes: ["Vulcoes (USGS)", elements.statusVolcanoes]
  };
  return Object.values(labels)
    .filter(([, element]) => element && element.textContent === "ERRO")
    .map(([name]) => name);
}

function updateErrorBanner() {
  const banner = elements.errorBanner;
  if (!banner) return;
  const failed = failedSourceNames();
  banner.classList.toggle("hidden", !failed.length);
  if (elements.errorBannerText) {
    elements.errorBannerText.textContent = failed.length
      ? `Falha ao carregar: ${failed.join(", ")}. Tentando novamente automaticamente.`
      : "";
  }
}

async function retryFailedSources() {
  lastWeatherFetch = 0;
  lastRegionalFetch = 0;
  await refreshAll(true);
  if (map) scheduleRegionalUpdate();
}

const AUTO_RETRY_BASE_MS = 60 * 1000;
const AUTO_RETRY_MAX_MS = 10 * 60 * 1000;
let autoRetryTimer = null;
let autoRetryDelay = AUTO_RETRY_BASE_MS;

function hasSourceFailures() {
  const openMeteoBlocked = !openMeteoAvailable();
  const inmetBlocked = Date.now() < inmetBlockedUntil;
  const elementsToCheck = [
    elements.statusUsgs,
    elements.statusEonet,
    elements.statusSolar,
    elements.statusVolcanoes
  ];
  if (!openMeteoBlocked) {
    elementsToCheck.push(elements.statusWinds, elements.statusRain, elements.statusFloods);
  }
  if (!inmetBlocked) {
    elementsToCheck.push(elements.statusInmet);
  }
  return elementsToCheck.some(element => element && element.textContent === "ERRO");
}

function clearAutoRetry() {
  clearTimeout(autoRetryTimer);
  autoRetryTimer = null;
  autoRetryDelay = AUTO_RETRY_BASE_MS;
}

function scheduleAutoRetry() {
  clearAutoRetry();
  if (!hasSourceFailures()) return;
  autoRetryTimer = setTimeout(() => {
    retryFailedSources();
  }, autoRetryDelay);
  autoRetryDelay = Math.min(autoRetryDelay * 2, AUTO_RETRY_MAX_MS);
}

async function refreshAll(showLoading = false) {
  if (showLoading) setLoading(true);
  checkQuotaReset();
  const sources = getSettings().sources;
  if (sources.usgs) setApiStatus("usgs", "loading");
  if (sources.eonet) setApiStatus("eonet", "loading");
  if (sources.openmeteo || sources.inmet) setApiStatus("weather", "loading");
  if (sources.solar) setApiStatus("solar", "loading");
  if (sources.fires) setApiStatus("fires", "loading");
  if (sources.volcanoes) setApiStatus("volcanoes", "loading");
  setApiStatus("civilDefense", "loading");
  const fetches = [];
  if (sources.usgs) fetches.push(updateEarthquakes());
  if (sources.eonet) fetches.push(updateStorms());
  if (sources.openmeteo || sources.inmet) fetches.push(updateWeather(true));
  if (sources.solar) fetches.push(updateSolar());
  if (sources.fires) fetches.push(updateFires());
  if (sources.volcanoes) fetches.push(updateVolcanoes());
  fetches.push(updateCivilDefense());
  await Promise.allSettled(fetches);
  state.lastUpdate = new Date();
  render();
  updateErrorBanner();
  setLoading(false);
  invalidateMapSize();
  scheduleAutoRetry();
}

async function refreshEarthquakesOnly() {
  await updateEarthquakes();
  state.lastUpdate = new Date();
  render();
}

async function refreshStormsOnly() {
  await updateStorms();
  state.lastUpdate = new Date();
  render();
}

function bindControls() {
  const applyFilters = () => {
    state.filters = readFilters();
    elements.magnitudeValue.textContent = state.filters.minMagnitude.toFixed(1);
    render();
  };

  elements.filterEarthquakes.addEventListener("change", applyFilters);
  elements.filterStorms.addEventListener("change", applyFilters);
  elements.filterWinds.addEventListener("change", async () => {
    state.filters = readFilters();
    if (state.filters.winds) {
      await updateWeather();
      render();
      if (map) scheduleRegionalUpdate();
    } else {
      state.winds = [];
      render();
    }
  });
  elements.filterRain.addEventListener("change", async () => {
    state.filters = readFilters();
    if (state.filters.rain) {
      await updateWeather();
      render();
      if (map) scheduleRegionalUpdate();
    } else {
      state.rains = [];
      render();
    }
  });
  elements.filterFloods?.addEventListener("change", async () => {
    state.filters = readFilters();
    if (state.filters.floods) {
      await updateWeather(true);
      render();
    } else {
      state.floods = [];
      render();
    }
  });
  elements.filterFires?.addEventListener("change", async () => {
    state.filters = readFilters();
    if (state.filters.fires) {
      if (!state.fires.length) {
        await updateFires();
      }
      render();
    } else {
      state.fires = [];
      render();
    }
  });
  elements.filterVolcanoes?.addEventListener("change", async () => {
    state.filters = readFilters();
    if (state.filters.volcanoes) {
      if (!state.volcanoes.length) {
        await updateVolcanoes();
      }
      render();
    } else {
      render();
    }
  });
  elements.filterCivilDefense?.addEventListener("change", async () => {
    state.filters = readFilters();
    if (state.filters.civilDefense) {
      if (!state.civilDefense.length) {
        await updateCivilDefense();
      }
      render();
    } else {
      render();
    }
  });
  elements.magnitudeFilter.addEventListener("input", applyFilters);
  elements.periodFilter.addEventListener("change", async () => {
    state.filters = readFilters();
    elements.magnitudeValue.textContent = state.filters.minMagnitude.toFixed(1);
    await updateEarthquakes();
    render();
  });
  elements.refreshButton.addEventListener("click", () => refreshAll(true));
  elements.worldButton.addEventListener("click", fitWorld);
  elements.retryButton?.addEventListener("click", retryFailedSources);
  document.querySelector("#dismiss-error-button")?.addEventListener("click", () => {
    elements.errorBanner?.classList.add("hidden");
  });
}

const EARTHQUAKE_POLL_MS = 60 * 1000;
const STORM_POLL_MS = 15 * 60 * 1000;
const SOLAR_POLL_MS = 30 * 60 * 1000;
const FLOOD_POLL_MS = 30 * 60 * 1000;
const VOLCANO_POLL_MS = 30 * 60 * 1000;
const CIVIL_DEFENSE_POLL_MS = 15 * 60 * 1000;
const OPEN_METEO_DAILY_QUOTA = 10000;
const QUOTA_SAFETY_FACTOR = 0.75;
const BASE_WEATHER_POINTS = WORLD_WIND_CITIES.length;
const MAX_WEATHER_CYCLES_PER_DAY = Math.floor(
  (OPEN_METEO_DAILY_QUOTA * QUOTA_SAFETY_FACTOR) / Math.min(BASE_WEATHER_POINTS, 45)
);
const WEATHER_POLL_MINUTES = Math.max(20, Math.ceil(1440 / MAX_WEATHER_CYCLES_PER_DAY));
const WEATHER_POLL_MS = WEATHER_POLL_MINUTES * 60 * 1000;

function startPolling() {
  const sources = getSettings().sources;
  clearInterval(earthquakeTimer);
  clearInterval(stormTimer);
  clearInterval(weatherTimer);
  clearInterval(solarTimer);
  clearInterval(floodTimer);
  clearInterval(volcanoTimer);
  clearInterval(civilDefenseTimer);
  if (sources.usgs) earthquakeTimer = setInterval(() => { checkQuotaReset(); refreshEarthquakesOnly(); }, EARTHQUAKE_POLL_MS);
  if (sources.eonet) stormTimer = setInterval(() => { checkQuotaReset(); refreshStormsOnly(); }, STORM_POLL_MS);
  if (sources.openmeteo || sources.inmet) weatherTimer = setInterval(() => { checkQuotaReset(); updateWeather(); render(); }, WEATHER_POLL_MS);
  solarTimer = setInterval(async () => {
    checkQuotaReset();
    const s = getSettings().sources;
    if (!s.solar) return;
    await updateSolar();
    render();
  }, SOLAR_POLL_MS);
  floodTimer = setInterval(async () => {
    if (state.filters.floods) {
      checkQuotaReset();
      const s = getSettings().sources;
      if (!s.openmeteo && !s.inmet) return;
      await updateWeather(true);
      render();
    }
  }, FLOOD_POLL_MS);
  volcanoTimer = setInterval(async () => {
    checkQuotaReset();
    const s = getSettings().sources;
    if (!s.volcanoes) return;
    await updateVolcanoes();
    render();
  }, VOLCANO_POLL_MS);
  civilDefenseTimer = setInterval(async () => {
    checkQuotaReset();
    await updateCivilDefense();
    render();
  }, CIVIL_DEFENSE_POLL_MS);
}

window.addEventListener("DOMContentLoaded", () => {
  checkQuotaReset();
  refreshIcons();
  initSettings();
  setSoundEnabled(getSettings().sound);
  tvApi = initTvMode();
  map = initMap();
  map.on("zoomend", scheduleRegionalUpdate);
  bindControls();
  invalidateMapSize();
  initAlertSystem();

  offlineApi = initOfflineSources(
    getSettings,
    (key, events) => {
      state.offline = [...state.offline.filter(e => e.offlineType !== key), ...events];
      setApiStatus(`offline-${key}`, "online", `${events.length} eventos`);
      render();
    },
    (key, status, detail) => {
      setApiStatus(`offline-${key}`, status, detail);
    }
  );

  onSettingsChange((key, value, allSettings) => {
    if (key === "mapStyle") setMapStyle(value);
    if (key === "markerSize" || key === "heatOverlay") render();
    if (key === "refreshInterval" || key === "autoRefresh") {
      startPolling();
    }
    if (key === "sound") setSoundEnabled(value);
    if (key === "source") {
      const { source, enabled, sources } = value;
      if (!enabled) {
        if (source === "usgs") state.earthquakes = [];
        if (source === "eonet") state.storms = [];
        if (source === "volcanoes") state.volcanoes = [];
        if (source === "fires") state.fires = [];
        if (source === "solar") state.solar = null;
        if (source === "openmeteo" || source === "inmet") {
          if (!sources.openmeteo && !sources.inmet) {
            state.winds = [];
            state.rains = [];
            state.floods = [];
            state.climateExtremes = null;
          }
        }
        render();
      } else {
        if (source === "usgs") updateEarthquakes().then(render);
        if (source === "eonet") updateStorms().then(render);
        if (source === "volcanoes") updateVolcanoes().then(render);
        if (source === "fires") updateFires().then(render);
        if (source === "solar") updateSolar().then(render);
        if (source === "openmeteo" || source === "inmet") {
          updateWeather(true).then(render);
        }
        if (source === "floods" && state.filters.floods) {
          updateWeather(true).then(render);
        }
      }
      startPolling();
    }
    if (key === "offline") {
      const { key: offlineKey, config } = value;
      offlineApi?.update(offlineKey, config);
      if (!config.enabled) {
        state.offline = state.offline.filter(e => e.offlineType !== offlineKey);
        render();
      }
    }
  });

  refreshAll(true).then(() => {
    startPolling();
    scheduleRegionalUpdate();
  });
});
