import { getMagnitudeStyle } from "./earthquakes.js";
import { getVolcanoStyle } from "./volcanoes.js";
import { getWeather } from "./weather.js";
import { reverseGeocode, searchPlaces } from "./geocoding.js";
import { calculateDistance, escapeHtml, formatDateTime, isValidCoordinate, safeExternalUrl } from "./utils.js";
import { setApiStatus, refreshIcons, elements } from "./ui.js";
import { getSettings } from "./settings.js";

let map;
let earthquakeLayer;
let stormLayer;
let windLayer;
let rainLayer;
let floodLayer;
let fireLayer;
let volcanoLayer;
let civilDefenseLayer;
let heatLayer;
let userLocationMarker = null;
let currentBaseLayer = null;
let layerControl = null;
const markerById = new Map();
const LOCAL_WEATHER_MIN_ZOOM = 10;
const LOCAL_WEATHER_DEBOUNCE_MS = 1200;
let localWeatherTimer = null;
let invalidateTimer = null;
const BRAZIL_CENTER = [-14.235, -51.9253];
const BRAZIL_ZOOM = 4;
const BRAZIL_BOUNDS = [[5.5, -74.5], [-34.0, -33.5]];
const WORLD_BOUNDS = [[-60, -170], [80, 170]];

function domId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

const markerScale = () => {
  const settingsScale = getSettings()?.markerSize ?? 1;
  const tvScale = document.documentElement.classList.contains("tv-mode") ? 1.45 : 1;
  return settingsScale * tvScale;
};

export function getMarkerScale() { return markerScale(); }
export function isHeatOverlayEnabled() { return getSettings()?.heatOverlay ?? true; }

const BASE_LAYERS = {
  openstreetmap: {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  },
  openstreetmaphot: {
    name: "OSM Humanitário",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noopener noreferrer">Humanitarian OpenStreetMap Team</a>'
    }
  },
  cartodark: {
    name: "CARTO Escuro",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  },
  cartovoyager: {
    name: "CARTO Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  },
  satellite: {
    name: "Satélite (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    }
  },
  terrain: {
    name: "Terreno (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, Topografische Grundkarte der Schweizerischen Eidgenossenschaft, and the GIS User Community'
    }
  },
  relief: {
    name: "Relevo (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 13,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri'
    }
  },
  topo: {
    name: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 17,
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
    }
  }
};

export const BRAZIL_BOUNDS_LATLNG = L.latLngBounds(BRAZIL_BOUNDS);

function buildBaseLayerControl() {
  const baseLayers = {};
  const overlays = {
    "Concentracao": heatLayer,
    "Terremotos": earthquakeLayer,
    "Tempestades": stormLayer,
    "Ventos fortes": windLayer,
    "Chuvas": rainLayer,
    "Enchentes": floodLayer,
    "Queimadas": fireLayer,
    "Vulcoes": volcanoLayer,
    "Defesa Civil": civilDefenseLayer
  };
  for (const [key, layer] of Object.entries(BASE_LAYERS)) {
    const tileLayer = L.tileLayer(layer.url, { ...layer.options, subdomains: key === "satellite" || key === "terrain" || key === "relief" ? [] : "abc" });
    baseLayers[layer.name] = tileLayer;
    if (key === "openstreetmap") {
      currentBaseLayer = tileLayer;
    }
  }
  currentBaseLayer.addTo(map);
  layerControl = L.control.layers(baseLayers, overlays, { position: "topleft", collapsed: true }).addTo(map);
}

export function setMapStyle(styleKey) {
  if (!map || !BASE_LAYERS[styleKey]) return;
  const layerConfig = BASE_LAYERS[styleKey];
  if (currentBaseLayer) map.removeLayer(currentBaseLayer);
  const subdomains = styleKey === "satellite" || styleKey === "terrain" || styleKey === "relief" ? [] : "abc";
  currentBaseLayer = L.tileLayer(layerConfig.url, { ...layerConfig.options, subdomains });
  currentBaseLayer.addTo(map);
}

export function initMap() {
  map = L.map("map", {
    worldCopyJump: true,
    maxBounds: [[-85, -220], [85, 220]],
    maxBoundsViscosity: 0.35,
    zoomControl: false
  }).setView(BRAZIL_CENTER, BRAZIL_ZOOM);
  L.control.zoom({ zoomInTitle: "Aproximar", zoomOutTitle: "Afastar" }).addTo(map);
  earthquakeLayer = L.layerGroup().addTo(map);
  stormLayer = L.layerGroup().addTo(map);
  windLayer = L.layerGroup().addTo(map);
  rainLayer = L.layerGroup().addTo(map);
  floodLayer = L.layerGroup().addTo(map);
  fireLayer = L.layerGroup().addTo(map);
  volcanoLayer = L.layerGroup().addTo(map);
  civilDefenseLayer = L.layerGroup().addTo(map);
  heatLayer = L.layerGroup().addTo(map);
  buildBaseLayerControl();
  const savedStyle = getSettings()?.mapStyle;
  if (savedStyle && savedStyle !== "openstreetmap") setMapStyle(savedStyle);
  L.control.scale({ metric: true, imperial: false }).addTo(map);
  map.on("click", showLocationWeatherPopup);
  map.on("zoomend moveend", scheduleLocalWeatherUpdate);
  setupLocationSearch();
  setupLocateButton();
  map.whenReady(() => {
    invalidateMapSize();
    map.fitBounds(BRAZIL_BOUNDS, { animate: false, padding: [18, 18] });
  });
  invalidateMapSize();
  window.addEventListener("resize", invalidateMapSize);
  return map;
}

export function invalidateMapSize() {
  if (!map) return;
  clearTimeout(invalidateTimer);
  invalidateTimer = setTimeout(() => {
    map.invalidateSize({ animate: false });
  }, 150);
}

function weatherMarkup(weather) {
  return `
    <dl>
      <dt>Temperatura</dt><dd>${escapeHtml(weather.temperature ?? "--")} °C</dd>
      <dt>Sensacao</dt><dd>${escapeHtml(weather.apparentTemperature ?? "--")} °C</dd>
      <dt>Umidade</dt><dd>${escapeHtml(weather.humidity ?? "--")}%</dd>
      <dt>Vento</dt><dd>${escapeHtml(weather.windSpeed ?? "--")} km/h</dd>
      <dt>Rajadas</dt><dd>${escapeHtml(weather.windGusts ?? "--")} km/h</dd>
      <dt>Direcao</dt><dd>${escapeHtml(weather.windDirection ?? "--")}°</dd>
      <dt>Pressao</dt><dd>${escapeHtml(weather.pressure ?? "--")} hPa</dd>
      <dt>Condicao</dt><dd>${escapeHtml(weather.description)}</dd>
      <dt>Observado</dt><dd>${escapeHtml(weather.observedAt || "Indisponivel")}</dd>
    </dl>
  `;
}

function locationPopupLoading(latitude, longitude) {
  return `
    <div class="popup">
      <h3>Local selecionado</h3>
      <dl>
        <dt>Coordenadas</dt><dd>${escapeHtml(latitude.toFixed(4))}, ${escapeHtml(longitude.toFixed(4))}</dd>
      </dl>
      <div class="popup-section">
        <h3>Localidade</h3>
        <p class="alert-meta">Identificando localidade...</p>
      </div>
      <div class="popup-section">
        <h3>Clima local</h3>
        <p class="alert-meta">Carregando clima...</p>
      </div>
    </div>
  `;
}

function locationPopupMarkup(latitude, longitude, location, weather, geocodeFailed = false) {
  const locationText = geocodeFailed
    ? "Localidade indisponivel"
    : `${escapeHtml(location.name)}${location.region ? ` · ${escapeHtml(location.region)}` : ""}`;

  return `
    <div class="popup">
      <h3>${locationText}</h3>
      <dl>
        <dt>Coordenadas</dt><dd>${escapeHtml(latitude.toFixed(4))}, ${escapeHtml(longitude.toFixed(4))}</dd>
        <dt>Fonte local</dt><dd>${geocodeFailed ? "Indisponivel" : escapeHtml(location.source)}</dd>
      </dl>
      <div class="popup-section">
        <h3>Clima local</h3>
        ${weather ? weatherMarkup(weather) : "<p class=\"alert-meta\">Dados meteorologicos indisponiveis.</p>"}
      </div>
    </div>
  `;
}

async function showLocationWeatherPopup(event) {
  if (!map || !event?.latlng) return;
  const latitude = event.latlng.lat;
  const longitude = event.latlng.lng;
  const popup = L.popup({ maxWidth: 340 })
    .setLatLng(event.latlng)
    .setContent(locationPopupLoading(latitude, longitude))
    .openOn(map);

  setApiStatus("weather", "loading");
  const [locationResult, weatherResult] = await Promise.allSettled([
    reverseGeocode(latitude, longitude),
    getWeather(latitude, longitude)
  ]);
  const location = locationResult.status === "fulfilled"
    ? locationResult.value
    : { name: "Local selecionado", region: "", source: "" };
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  setApiStatus("weather", weather ? "online" : "error");
  popup.setContent(locationPopupMarkup(latitude, longitude, location, weather, locationResult.status === "rejected"));
}

export function scheduleLocalWeatherUpdate() {
  clearTimeout(localWeatherTimer);
  localWeatherTimer = setTimeout(updateLocalWeatherPanel, LOCAL_WEATHER_DEBOUNCE_MS);
}

function localWeatherTitle(location, center) {
  if (!location) return `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`;
  return location.region ? `${location.name} · ${location.region}` : location.name;
}

async function updateLocalWeatherPanel() {
  const panel = elements.localWeather;
  if (!panel) return;
  if (!map || map.getZoom() < LOCAL_WEATHER_MIN_ZOOM) {
    panel.classList.add("hidden");
    panel.replaceChildren();
    return;
  }
  const center = map.getCenter();
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <button type="button" class="local-weather-close" id="local-weather-close" title="Fechar" aria-label="Fechar painel de clima local"><i data-lucide="x" aria-hidden="true"></i></button>
    <div class="local-weather-title"><i data-lucide="map-pin" aria-hidden="true"></i><h3>Carregando clima local...</h3></div>
    <p class="alert-meta">Consultando dados da regiao.</p>
  `;
  refreshIcons();
  setApiStatus("weather", "loading");
  const [locationResult, weatherResult] = await Promise.allSettled([
    reverseGeocode(center.lat, center.lng),
    getWeather(center.lat, center.lng)
  ]);
  if (!map || map.getZoom() < LOCAL_WEATHER_MIN_ZOOM) return;
  const location = locationResult.status === "fulfilled" ? locationResult.value : null;
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  setApiStatus("weather", weather ? "online" : "error");
  panel.innerHTML = `
    <button type="button" class="local-weather-close" id="local-weather-close" title="Fechar" aria-label="Fechar painel de clima local"><i data-lucide="x" aria-hidden="true"></i></button>
    <div class="local-weather-title"><i data-lucide="map-pin" aria-hidden="true"></i><h3>${escapeHtml(localWeatherTitle(location, center))}</h3></div>
    ${weather ? weatherMarkup(weather) : "<p class=\"alert-meta\">Dados meteorologicos indisponiveis para esta area.</p>"}
  `;
  const closeBtn = panel.querySelector("#local-weather-close");
  if (closeBtn) closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
  refreshIcons();
}

function userDistanceHtml(event) {
  if (!map) return "";
  const center = map.getCenter();
  const dist = calculateDistance(center.lat, center.lng, event.latitude, event.longitude);
  if (dist === null) return "";
  return `<dt>Distancia</dt><dd>${Math.round(dist)} km de visualizacao</dd>`;
}

function nearbyMarkup(event, allEvents) {
  const nearby = allEvents
    .filter(item => item.id !== event.id)
    .map(item => ({ item, distance: calculateDistance(event.latitude, event.longitude, item.latitude, item.longitude) }))
    .filter(entry => entry.distance !== null && entry.distance <= 300)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);
  if (!nearby.length) return "<p class=\"alert-meta\">Nenhum evento proximo em ate 300 km.</p>";
  return nearby.map(({ item, distance }) => `
    <div>${item.type === "storm" ? "◉" : item.type === "wind" ? "◈" : item.type === "rain" ? "◍" : item.type === "fire" ? "🔥" : item.type === "volcano" ? "🔺" : item.type === "river_flood" || item.type === "flood_risk" ? "≋" : "●"} ${escapeHtml(nearbyLabel(item))} <strong>${Math.round(distance)} km</strong></div>
  `).join("");
}

function nearbyLabel(item) {
  if (item.type === "storm") return item.title;
  if (item.type === "wind") return `${item.place} · vento ${item.windSpeed.toFixed(0)} km/h`;
  if (item.type === "rain") return `${item.place} · chuva ${item.precipitation.toFixed(1)} mm/h`;
  if (item.type === "fire") return `Foco de queimada · ${item.satellite || "?"}`;
  if (item.type === "volcano") return `${item.title} · alerta ${item.alertLevel}`;
  if (item.type === "river_flood") return `Rio ${item.river || item.name} · risco ${item.riskLevel}`;
  if (item.type === "flood_risk") return `${item.name} · risco ${item.riskLevel}`;
  return `Terremoto M${item.magnitude.toFixed(1)}`;
}

function eventPopup(event, allEvents) {
  const url = safeExternalUrl(event.url);
  const link = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Ver evento original</a>` : "";
  const distanceHtml = userDistanceHtml(event);
  const offlineBadge = event.offline ? `<span class="offline-tag">OFFLINE - ${escapeHtml(event.source)}</span>` : "";
  const body = event.type === "earthquake" ? `
    <h3>Terremoto ${offlineBadge}</h3>
    <dl>
      <dt>Magnitude</dt><dd>${escapeHtml(event.magnitude.toFixed(1))} ${event.magType ? `(${escapeHtml(event.magType)})` : ""}</dd>
      <dt>Localizacao</dt><dd>${escapeHtml(event.place)}</dd>
      <dt>Profundidade</dt><dd>${event.depth === null ? "Indisponivel" : `${escapeHtml(event.depth.toFixed(1))} km`}${event.depthInfo ? ` — ${escapeHtml(event.depthInfo.label)}` : ""}</dd>
      ${event.depthInfo?.context ? `<dt>Contexto geologico</dt><dd>${escapeHtml(event.depthInfo.context)}</dd>` : ""}
      ${event.tectonicContext ? `<dt>Placas tectonicas</dt><dd>${escapeHtml(event.tectonicContext)}</dd>` : ""}
      ${event.tsunami ? `<dt>Risco de tsunami</dt><dd style="color: var(--danger); font-weight: 600">SIM</dd>` : ""}
      <dt>Risco</dt><dd>${escapeHtml(event.riskLevel || "baixo")}</dd>
      <dt>Horario</dt><dd>${escapeHtml(formatDateTime(event.timestamp))}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
      ${distanceHtml}
    </dl>
  ` : event.type === "wind" ? `
    <h3>Vento forte ${offlineBadge}</h3>
    <dl>
      <dt>Velocidade</dt><dd>${escapeHtml(event.windSpeed.toFixed(0))} km/h</dd>
      <dt>Rajada</dt><dd>${event.windGusts === null ? "Indisponivel" : `${escapeHtml(event.windGusts.toFixed(0))} km/h`}</dd>
      <dt>Direcao</dt><dd>${event.windDirection === null ? "Indisponivel" : `${escapeHtml(event.windDirection.toFixed(0))}°`}</dd>
      <dt>Local</dt><dd>${escapeHtml(event.place)}</dd>
      <dt>Observado</dt><dd>${escapeHtml(formatDateTime(event.timestamp))}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
      ${distanceHtml}
    </dl>
  ` : event.type === "rain" ? `
    <h3>Chuva ${offlineBadge}</h3>
    <dl>
      <dt>Precipitacao</dt><dd>${escapeHtml(event.precipitation.toFixed(1))} mm/h</dd>
      <dt>Intensidade</dt><dd>${escapeHtml(rainIntensityLabel(event.precipitation))}</dd>
      <dt>Condicao</dt><dd>${escapeHtml(event.description || "Indisponivel")}</dd>
      <dt>Local</dt><dd>${escapeHtml(event.place)}</dd>
      <dt>Observado</dt><dd>${escapeHtml(formatDateTime(event.timestamp))}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
      ${distanceHtml}
    </dl>
  ` : event.type === "river_flood" ? `
    <h3>Enchente - Rio ${offlineBadge}</h3>
    <dl>
      <dt>Rio</dt><dd>${escapeHtml(event.river || event.name)}</dd>
      <dt>Nivel atual</dt><dd>${event.currentLevel != null ? `${escapeHtml(event.currentLevel.toFixed(2))} m` : "Indisponivel"}</dd>
      <dt>Nivel de alerta</dt><dd>${event.alertLevel != null ? `${escapeHtml(event.alertLevel.toFixed(2))} m` : "Indisponivel"}</dd>
      <dt>Risco</dt><dd>${escapeHtml(event.riskLevel || "desconhecido")}</dd>
      <dt>Local</dt><dd>${escapeHtml(event.name)}${event.state ? ` · ${escapeHtml(event.state)}` : ""}</dd>
      <dt>Atualizado</dt><dd>${escapeHtml(formatDateTime(event.lastUpdate || event.timestamp))}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
    </dl>
  ` : event.type === "flood_risk" ? `
    <h3>Risco de Enchente ${offlineBadge}</h3>
    <dl>
      <dt>Chuva 24h</dt><dd>${event.rain24h != null ? `${escapeHtml(event.rain24h.toFixed(1))} mm` : "Indisponivel"}</dd>
      <dt>Chuva 72h</dt><dd>${event.rain72h != null ? `${escapeHtml(event.rain72h.toFixed(1))} mm` : "Indisponivel"}</dd>
      <dt>Nivel de risco</dt><dd>${escapeHtml(event.riskLevel || "desconhecido")}</dd>
      <dt>Local</dt><dd>${escapeHtml(event.name)}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
    </dl>
  ` : event.type === "fire" ? `
    <h3>Foco de Queimada ${offlineBadge}</h3>
    <dl>
      <dt>Satelite</dt><dd>${escapeHtml(event.satellite || "Desconhecido")}</dd>
      <dt>Localizacao</dt><dd>${escapeHtml(event.latitude.toFixed(4))}, ${escapeHtml(event.longitude.toFixed(4))}</dd>
      <dt>Detectado</dt><dd>${escapeHtml(formatDateTime(event.timestamp))}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
    </dl>
  ` : event.type === "volcano" ? `
    <h3>Atividade Vulcanica ${offlineBadge}</h3>
    <dl>
      <dt>Nome</dt><dd>${escapeHtml(event.title)}</dd>
      <dt>Nivel de alerta</dt><dd style="color: ${event.alertColor || "#ff9500"}; font-weight: 600">${escapeHtml(event.alertLevel)}</dd>
      <dt>Regiao</dt><dd>${escapeHtml(event.region || "Indisponivel")}</dd>
      <dt>Pais</dt><dd>${escapeHtml(event.country || "Indisponivel")}</dd>
      <dt>Tipo</dt><dd>${escapeHtml(event.volcanoType || "Indisponivel")}</dd>
      <dt>Elevacao</dt><dd>${event.elevation != null ? `${escapeHtml(event.elevation)} m` : "Indisponivel"}</dd>
      <dt>Coordenadas</dt><dd>${escapeHtml(event.latitude.toFixed(4))}, ${escapeHtml(event.longitude.toFixed(4))}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
      ${distanceHtml}
    </dl>
  ` : event.type === "civil_defense" ? `
    <h3>Defesa Civil ${offlineBadge}</h3>
    <dl>
      <dt>Evento</dt><dd>${escapeHtml(event.title)}</dd>
      <dt>Nivel</dt><dd style="color: ${event.severity === "critical" ? "var(--danger)" : event.severity === "important" ? "var(--warning)" : "#f59e0b"}; font-weight: 600">${escapeHtml(event.nivel)}</dd>
      <dt>Municipio</dt><dd>${escapeHtml(event.municipio)}${event.uf ? ` · ${escapeHtml(event.uf)}` : ""}</dd>
      <dt>Coordenadas</dt><dd>${escapeHtml(event.latitude.toFixed(4))}, ${escapeHtml(event.longitude.toFixed(4))}</dd>
      <dt>Aberto em</dt><dd>${escapeHtml(formatDateTime(event.timestamp))}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
      ${distanceHtml}
    </dl>
  ` : `
    <h3>Tempestade ${offlineBadge}</h3>
    <dl>
      <dt>Nome</dt><dd>${escapeHtml(event.title)}</dd>
      <dt>Categoria</dt><dd>${escapeHtml(event.category)}</dd>
      <dt>Localizacao</dt><dd>${escapeHtml(event.latitude.toFixed(2))}, ${escapeHtml(event.longitude.toFixed(2))}</dd>
      <dt>Atualizado</dt><dd>${escapeHtml(formatDateTime(event.timestamp))}</dd>
      <dt>Intensidade</dt><dd>${event.magnitudeValue === null ? "Indisponivel" : `${escapeHtml(event.magnitudeValue)} ${escapeHtml(event.magnitudeUnit)}`}</dd>
      <dt>Fonte</dt><dd>${escapeHtml(event.source)}</dd>
    </dl>
  `;

  return `
    <div class="popup" data-event-id="${escapeHtml(event.id)}">
      ${body}
      ${link}
      ${event.type === "wind" || event.type === "rain" || event.type === "fire" ? "" : `
      <div class="popup-section">
        <h3>Clima local</h3>
        <div id="weather-${domId(event.id)}">Carregando clima...</div>
      </div>`}
      <div class="popup-section">
        <h3>Eventos proximos</h3>
        ${nearbyMarkup(event, allEvents)}
      </div>
    </div>
  `;
}

async function loadPopupWeather(event) {
  const id = `weather-${domId(event.id)}`;
  const container = document.getElementById(id);
  if (!container) return;
  setApiStatus("weather", "loading");
  try {
    const weather = await getWeather(event.latitude, event.longitude);
    container.innerHTML = weatherMarkup(weather);
    setApiStatus("weather", "online");
  } catch {
    container.textContent = "Dados meteorologicos indisponiveis.";
    setApiStatus("weather", "error");
  }
}

function addEarthquake(event, allEvents) {
  const style = getMagnitudeStyle(event.magnitude);
  const marker = L.circleMarker([event.latitude, event.longitude], {
    radius: style.radius * markerScale(),
    color: "#fff",
    weight: 1,
    fillColor: style.color,
    fillOpacity: 0.78,
    bubblingMouseEvents: false
  }).bindPopup(eventPopup(event, allEvents));
  marker.on("popupopen", () => loadPopupWeather(event));
  marker.addTo(earthquakeLayer);
  markerById.set(event.id, marker);
}

function addStorm(event, allEvents) {
  const scale = markerScale();
  const size = Math.round(28 * scale);
  const icon = L.divIcon({
    className: "",
    html: `<div class="storm-marker" style="font-size: ${Math.round(18 * scale)}px" aria-hidden="true">◉</div>`,
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)]
  });
  const marker = L.marker([event.latitude, event.longitude], { icon, bubblingMouseEvents: false }).bindPopup(eventPopup(event, allEvents));
  marker.on("popupopen", () => loadPopupWeather(event));
  marker.addTo(stormLayer);
  markerById.set(event.id, marker);
}

function getWindColor(speed) {
  if (speed >= 90) return "#ff4dd8";
  if (speed >= 70) return "#ffbf47";
  return "#4da3ff";
}

function addWind(event, allEvents) {
  const scale = markerScale();
  const rotation = event.windDirection === null ? 0 : event.windDirection + 180;
  const size = Math.round(22 * scale);
  const icon = L.divIcon({
    className: "",
    html: `<div class="wind-marker" style="--wind-color: ${getWindColor(event.windSpeed)}; font-size: ${size}px; transform: rotate(${rotation}deg)">&#8593;</div>`,
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)]
  });
  const marker = L.marker([event.latitude, event.longitude], { icon, bubblingMouseEvents: false }).bindPopup(eventPopup(event, allEvents));
  marker.addTo(windLayer);
  markerById.set(event.id, marker);
}

function rainIntensityLabel(precipitation) {
  if (precipitation >= 10) return "Forte";
  if (precipitation >= 2) return "Moderada";
  return "Fraca";
}

function addRain(event, allEvents) {
  const intensity = event.precipitation >= 10 ? "#1f6feb" : event.precipitation >= 2 ? "#3aa0ff" : "#7fd4ff";
  const radius = event.precipitation >= 10 ? 13 : event.precipitation >= 2 ? 10 : 8;
  const marker = L.circleMarker([event.latitude, event.longitude], {
    radius: radius * markerScale(),
    color: "#fff",
    weight: 1,
    fillColor: intensity,
    fillOpacity: 0.75,
    bubblingMouseEvents: false
  }).bindPopup(eventPopup(event, allEvents));
  marker.addTo(rainLayer);
  markerById.set(event.id, marker);
}

function getFloodColor(riskLevel) {
  if (riskLevel === "high") return "#8b5cf6";
  if (riskLevel === "moderate") return "#06b6d4";
  return "#38bdf8";
}

function addFlood(event, allEvents) {
  const color = getFloodColor(event.riskLevel);
  const radius = event.riskLevel === "high" ? 14 : event.riskLevel === "moderate" ? 11 : 8;
  const marker = L.circleMarker([event.latitude, event.longitude], {
    radius: radius * markerScale(),
    color: "#fff",
    weight: 1.5,
    fillColor: color,
    fillOpacity: 0.7,
    bubblingMouseEvents: false
  }).bindPopup(eventPopup(event, allEvents));
  marker.addTo(floodLayer);
  markerById.set(event.id, marker);
}

function addHeat(events) {
  events.forEach(event => {
    const ageHours = Math.max(1, (Date.now() - new Date(event.timestamp).getTime()) / 3600000);
    const recency = Math.max(0.2, 1 / Math.sqrt(ageHours));
    const magnitude = event.type === "earthquake" ? event.magnitude : 4;
    const radius = Math.min(520000, 45000 + magnitude * 42000);
    L.circle([event.latitude, event.longitude], {
      radius,
      stroke: false,
      fillColor: event.type === "earthquake" ? "#ff7043" : "#4da3ff",
      fillOpacity: Math.min(0.22, 0.045 * magnitude * recency)
    }).addTo(heatLayer);
  });
}

function addFire(event, allEvents) {
  const age = (Date.now() - new Date(event.timestamp).getTime()) / 3600000;
  const opacity = Math.max(0.4, 1 - age / 48);
  const marker = L.circleMarker([event.latitude, event.longitude], {
    radius: 6 * markerScale(),
    color: "#ff6600",
    weight: 1.5,
    fillColor: "#ff3300",
    fillOpacity: opacity,
    bubblingMouseEvents: false
  }).bindPopup(eventPopup(event, allEvents));
  marker.addTo(fireLayer);
  markerById.set(event.id, marker);
}

function addVolcano(event, allEvents) {
  const style = getVolcanoStyle(event.alertLevel);
  const marker = L.circleMarker([event.latitude, event.longitude], {
    radius: style.radius,
    color: "#fff",
    weight: 1.5,
    fillColor: style.color,
    fillOpacity: 0.85,
    bubblingMouseEvents: false
  }).bindPopup(eventPopup(event, allEvents));
  marker.on("popupopen", () => loadPopupWeather(event));
  marker.addTo(volcanoLayer);
  markerById.set(event.id, marker);
}

function addCivilDefense(event, allEvents) {
  const severityColor = event.severity === "critical" ? "#ff3b30" : event.severity === "important" ? "#ff9500" : event.severity === "moderate" ? "#f59e0b" : "#34c759";
  const marker = L.circleMarker([event.latitude, event.longitude], {
    radius: 10,
    color: "#fff",
    weight: 1.5,
    fillColor: severityColor,
    fillOpacity: 0.85,
    bubblingMouseEvents: false
  }).bindPopup(eventPopup(event, allEvents));
  marker.addTo(civilDefenseLayer);
  markerById.set(event.id, marker);
}

export function renderMap(events) {
  invalidateMapSize();
  markerById.clear();
  earthquakeLayer.clearLayers();
  stormLayer.clearLayers();
  windLayer.clearLayers();
  rainLayer.clearLayers();
  floodLayer.clearLayers();
  fireLayer.clearLayers();
  volcanoLayer.clearLayers();
  civilDefenseLayer.clearLayers();
  heatLayer.clearLayers();
  if (isHeatOverlayEnabled()) addHeat(events);
  events.forEach(event => {
    if (event.type === "earthquake") addEarthquake(event, events);
    else if (event.type === "storm") addStorm(event, events);
    else if (event.type === "wind") addWind(event, events);
    else if (event.type === "rain") addRain(event, events);
    else if (event.type === "fire") addFire(event, events);
    else if (event.type === "volcano") addVolcano(event, events);
    else if (event.type === "river_flood" || event.type === "flood_risk") addFlood(event, events);
    else if (event.type === "civil_defense") addCivilDefense(event, events);
  });
}

export function focusEvent(event) {
  if (!map) return;
  map.setView([event.latitude, event.longitude], event.type === "storm" ? 5 : 6, { animate: true });
  const marker = markerById.get(event.id);
  if (marker) marker.openPopup();
}

export function fitWorld() {
  if (!map) return;
  invalidateMapSize();
  map.fitBounds(WORLD_BOUNDS, {
    animate: true,
    padding: [20, 20]
  });
}

export function fitBrazil() {
  if (!map) return;
  invalidateMapSize();
  map.fitBounds(BRAZIL_BOUNDS_LATLNG, { animate: true, padding: [40, 40] });
}

const SEARCH_DEBOUNCE_MS = 650;
let searchTimer = null;
let searchToken = 0;
let activeResultIndex = -1;
let currentSearchResults = [];

function clearSearchResults() {
  const list = document.getElementById("search-results");
  if (list) {
    list.replaceChildren();
    list.classList.add("hidden");
  }
  activeResultIndex = -1;
  currentSearchResults = [];
}

function flyToPlace(place) {
  if (!map || !place) return;
  const bbox = place.boundingBox;
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)) {
    map.flyToBounds([[bbox[0], bbox[2]], [bbox[1], bbox[3]]], {
      padding: [24, 24],
      maxZoom: 16,
      duration: 1.1
    });
  } else {
    map.flyTo([place.latitude, place.longitude], 13, { duration: 1.1 });
  }
}

function highlightSearchItem(index) {
  const list = document.getElementById("search-results");
  if (!list) return;
  [...list.children].forEach((item, position) => {
    item.classList.toggle("active", position === index);
  });
  activeResultIndex = index;
}

function selectSearchPlace(place) {
  clearSearchResults();
  const input = document.getElementById("search-input");
  if (input) input.value = place.displayName.split(",")[0];
  flyToPlace(place);
}

function renderSearchResults(results) {
  const list = document.getElementById("search-results");
  if (!list) return;
  list.replaceChildren();
  currentSearchResults = results;
  if (!results.length) {
    const empty = document.createElement("li");
    empty.className = "search-empty";
    empty.textContent = "Nenhuma localidade encontrada.";
    list.append(empty);
    list.classList.remove("hidden");
    return;
  }
  results.forEach((place, index) => {
    const item = document.createElement("li");
    item.className = "search-result";
    item.setAttribute("role", "option");
    item.tabIndex = -1;
    const nameElement = document.createElement("span");
    nameElement.className = "search-name";
    nameElement.textContent = place.name;
    const detailElement = document.createElement("small");
    detailElement.className = "search-detail";
    detailElement.textContent = place.displayName;
    item.append(nameElement, detailElement);
    item.addEventListener("click", () => selectSearchPlace(place));
    item.addEventListener("mousemove", () => highlightSearchItem(index));
    list.append(item);
  });
  list.classList.remove("hidden");
}

async function performLocationSearch(term) {
  const token = ++searchToken;
  try {
    const results = await searchPlaces(term);
    if (token !== searchToken) return;
    renderSearchResults(results);
  } catch (error) {
    if (token !== searchToken) return;
    const list = document.getElementById("search-results");
    if (list) {
      list.replaceChildren();
      const failed = document.createElement("li");
      failed.className = "search-empty";
      failed.textContent = "Falha na busca. Tente novamente.";
      list.append(failed);
      list.classList.remove("hidden");
    }
  }
}

function setupLocationSearch() {
  const input = document.getElementById("search-input");
  const resultsList = document.getElementById("search-results");
  if (!input || !resultsList) return;

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const term = input.value.trim();
    if (term.length < 3) {
      clearSearchResults();
      return;
    }
    searchTimer = setTimeout(() => performLocationSearch(term), SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      clearSearchResults();
      input.blur();
      return;
    }
    if (!currentSearchResults.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(Math.max(activeResultIndex + delta, 0), currentSearchResults.length - 1);
      highlightSearchItem(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const index = activeResultIndex >= 0 ? activeResultIndex : 0;
      selectSearchPlace(currentSearchResults[index]);
    }
  });

  document.addEventListener("click", event => {
    if (!event.target.closest("#search-box")) clearSearchResults();
  });
}

function setupLocateButton() {
  const btn = document.getElementById("locate-button");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocalizacao nao suportada neste navegador.");
      return;
    }

    btn.classList.add("locating");
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        if (!isValidCoordinate(latitude, longitude)) {
          btn.classList.remove("locating");
          btn.disabled = false;
          return;
        }

        if (userLocationMarker) {
          map.removeLayer(userLocationMarker);
        }

        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;background:var(--accent);border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(56,189,248,0.6);"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        userLocationMarker = L.marker([latitude, longitude], { icon })
          .addTo(map)
          .bindPopup("<b>Minha localizacao</b>");

        map.flyTo([latitude, longitude], 13, { duration: 1.2 });

        const input = document.getElementById("search-input");
        if (input) input.value = "";

        btn.classList.remove("locating");
        btn.disabled = false;
      },
      error => {
        btn.classList.remove("locating");
        btn.disabled = false;
        const messages = {
          1: "Permissao de localizacao negada.",
          2: "Localizacao indisponivel.",
          3: "Tempo esgotado ao buscar localizacao."
        };
        alert(messages[error.code] || "Erro ao buscar localizacao.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}
