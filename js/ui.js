import { getMagnitudeStyle } from "./earthquakes.js";
import { escapeHtml, formatDateTime, formatTime, formatCompactNumber, seismicEnergy, FLOOD_TYPES } from "./utils.js";
import { getQuotaInfo } from "./quota.js";
import { kpLevel } from "./solar.js";

const apiStatusRecord = { usgs: "loading", eonet: "loading", weather: "idle", winds: "idle", rain: "idle", inmet: "idle", solar: "idle", floods: "idle", fires: "idle", volcanoes: "idle", "offline-nwr_rtlsdr": "idle", "offline-goes_satellite": "idle", "offline-meshtastic_lora": "idle", "offline-hf_radio": "idle" };

export const elements = {
  loading: document.querySelector("#loading"),
  onlinePill: document.querySelector(".online-pill"),
  errorBanner: document.querySelector("#status-bar"),
  errorBannerText: document.querySelector("#status-bar-text"),
  retryButton: document.querySelector("#retry-button"),
  earthquakeCount: document.querySelector("#earthquake-count"),
  stormCount: document.querySelector("#storm-count"),
  windCount: document.querySelector("#wind-count"),
  rainCount: document.querySelector("#rain-count"),
  floodCount: document.querySelector("#flood-count"),
  strongCount: document.querySelector("#strong-count"),
  lastUpdate: document.querySelector("#last-update"),
  filterEarthquakes: document.querySelector("#filter-earthquakes"),
  filterStorms: document.querySelector("#filter-storms"),
  filterWinds: document.querySelector("#filter-winds"),
  filterRain: document.querySelector("#filter-rain"),
  magnitudeFilter: document.querySelector("#magnitude-filter"),
  magnitudeValue: document.querySelector("#magnitude-value"),
  periodFilter: document.querySelector("#period-filter"),
  refreshButton: document.querySelector("#refresh-button"),
  worldButton: document.querySelector("#world-button"),
  alertsList: document.querySelector("#alerts-list"),
  statusUsgs: document.querySelector("#status-usgs"),
  statusEonet: document.querySelector("#status-eonet"),
  statusWeather: document.querySelector("#status-weather"),
  statusWinds: document.querySelector("#status-winds"),
  statusRain: document.querySelector("#status-rain"),
  statusInmet: document.querySelector("#status-inmet"),
  statusSolar: document.querySelector("#status-solar"),
  statusFloods: document.querySelector("#status-floods"),
  apiStatusCount: document.querySelector("#api-status-count"),
  updatedUsgs: document.querySelector("#updated-usgs"),
  updatedEonet: document.querySelector("#updated-eonet"),
  updatedWeather: document.querySelector("#updated-weather"),
  updatedWinds: document.querySelector("#updated-winds"),
  updatedRain: document.querySelector("#updated-rain"),
  updatedInmet: document.querySelector("#updated-inmet"),
  updatedSolar: document.querySelector("#updated-solar"),
  updatedFloods: document.querySelector("#updated-floods"),
  quotaUsgs: document.querySelector("#quota-usgs"),
  quotaEonet: document.querySelector("#quota-eonet"),
  quotaWeather: document.querySelector("#quota-weather"),
  quotaWinds: document.querySelector("#quota-winds"),
  quotaRain: document.querySelector("#quota-rain"),
  quotaInmet: document.querySelector("#quota-inmet"),
  quotaSolar: document.querySelector("#quota-solar"),
  quotaFloods: document.querySelector("#quota-floods"),
  localWeather: document.querySelector("#local-weather"),
  criticalBanner: document.querySelector("#critical-banner"),
  newEventsBadge: document.querySelector("#new-events-badge"),
  tabAlerts: document.querySelector("#tab-alerts"),
  tabBulletin: document.querySelector("#tab-bulletin"),
  bulletinView: document.querySelector("#bulletin-view"),
  bulletinSummary: document.querySelector("#bulletin-summary"),
  bulletinBody: document.querySelector("#bulletin-body"),
  climateExtremes: document.querySelector("#climate-extremes"),
  solarBulletin: document.querySelector("#solar-bulletin"),
  filterFloods: document.querySelector("#filter-floods"),
  filterFires: document.querySelector("#filter-fires"),
  filterVolcanoes: document.querySelector("#filter-volcanoes"),
  filterCivilDefense: document.querySelector("#filter-civil-defense"),
  fireCount: document.querySelector("#fire-count"),
  volcanoCount: document.querySelector("#volcano-count"),
  statusFires: document.querySelector("#status-fires"),
  statusVolcanoes: document.querySelector("#status-volcanoes"),
  updatedFires: document.querySelector("#updated-fires"),
  updatedVolcanoes: document.querySelector("#updated-volcanoes"),
  quotaFires: document.querySelector("#quota-fires"),
  quotaVolcanoes: document.querySelector("#quota-volcanoes"),
  statusOfflineNwr: document.querySelector("#status-offline-nwr_rtlsdr"),
  statusOfflineGoes: document.querySelector("#status-offline-goes_satellite"),
  statusOfflineMeshtastic: document.querySelector("#status-offline-meshtastic_lora"),
  statusOfflineHf: document.querySelector("#status-offline-hf_radio")
};

function switchAlertTab(target) {
  const isBulletin = target === "bulletin";
  elements.tabAlerts?.classList.toggle("active", !isBulletin);
  elements.tabAlerts?.setAttribute("aria-selected", String(!isBulletin));
  elements.tabBulletin?.classList.toggle("active", isBulletin);
  elements.tabBulletin?.setAttribute("aria-selected", String(isBulletin));
  elements.alertsList?.classList.toggle("hidden", isBulletin);
  elements.bulletinView?.classList.toggle("hidden", !isBulletin);
}

elements.tabAlerts?.addEventListener("click", () => switchAlertTab("alerts"));
elements.tabBulletin?.addEventListener("click", () => switchAlertTab("bulletin"));

export function setLoading(isLoading) {
  elements.loading.classList.toggle("hidden", !isLoading);
}

export function setApiStatus(source, status, detail = "") {
  const map = { usgs: elements.statusUsgs, eonet: elements.statusEonet, weather: elements.statusWeather, winds: elements.statusWinds, rain: elements.statusRain, inmet: elements.statusInmet, solar: elements.statusSolar, floods: elements.statusFloods, fires: elements.statusFires, volcanoes: elements.statusVolcanoes, "offline-nwr_rtlsdr": elements.statusOfflineNwr, "offline-goes_satellite": elements.statusOfflineGoes, "offline-meshtastic_lora": elements.statusOfflineMeshtastic, "offline-hf_radio": elements.statusOfflineHf };
  const updatedMap = { usgs: elements.updatedUsgs, eonet: elements.updatedEonet, weather: elements.updatedWeather, winds: elements.updatedWinds, rain: elements.updatedRain, inmet: elements.updatedInmet, solar: elements.updatedSolar, floods: elements.updatedFloods, fires: elements.updatedFires, volcanoes: elements.updatedVolcanoes };
  const element = map[source];
  if (!element) return;
  apiStatusRecord[source] = status;
  element.className = `status ${status}`;
  const base = status === "online" ? "ONLINE" : status === "error" ? "ERRO" : status === "loading" ? "CARREGANDO" : "IDLE";
  element.textContent = detail && status === "online" ? `${base} · ${detail}` : base;
  if (status === "online" && updatedMap[source]) {
    updatedMap[source].textContent = formatTime(new Date());
    updatedMap[source].dateTime = new Date().toISOString();
  }
  updateGlobalStatus();
  renderQuotaInfo();
}

function renderQuotaInfo() {
  const quotaMap = {
    usgs: elements.quotaUsgs,
    eonet: elements.quotaEonet,
    weather: elements.quotaWeather,
    winds: elements.quotaWinds,
    rain: elements.quotaRain,
    inmet: elements.quotaInmet,
    solar: elements.quotaSolar,
    floods: elements.quotaFloods,
    volcanoes: elements.quotaVolcanoes
  };
  const info = getQuotaInfo();
  const weatherInfo = info.find(q => q.source === "weather");
  info.forEach(q => {
    const el = quotaMap[q.source];
    if (!el) return;
    if (q.source === "winds" || q.source === "rain") {
      el.textContent = `compartilhado com Open-Meteo (${weatherInfo?.calls ?? 0} chamadas)`;
      el.className = "quota-info shared";
      return;
    }
    if (q.limit === Infinity) {
      el.textContent = `${q.calls} chamadas hoje`;
      el.className = "quota-info";
    } else {
      const pct = q.pct;
      const barColor = pct >= 90 ? "var(--danger)" : pct >= 70 ? "var(--warning)" : "var(--accent)";
      el.innerHTML = `<span class="quota-text">${q.calls.toLocaleString()}/${q.limit.toLocaleString()} chamadas (${pct}%)</span><span class="quota-bar"><span class="quota-fill" style="width:${pct}%;background:${barColor}"></span></span>`;
      el.className = "quota-info has-bar";
    }
  });
}

export function apiOverview() {
  const checked = Object.entries(apiStatusRecord).filter(([, status]) => status !== "idle");
  if (!checked.length) return { anyError: false, global: "online" };
  const errors = checked.filter(([, status]) => status === "error");
  if (errors.length === checked.length) return { anyError: true, global: "offline" };
  if (errors.length) return { anyError: true, global: "partial" };
  return { anyError: false, global: "online" };
}

export function updateGlobalStatus() {
  const pill = elements.onlinePill;
  if (pill) {
    const { global } = apiOverview();
    pill.classList.toggle("ok", global === "online");
    pill.classList.toggle("warn", global === "partial");
    pill.classList.toggle("err", global === "offline");
    const label = global === "offline" ? "OFFLINE" : global === "partial" ? "PARCIAL" : "ONLINE";
    const labelEl = pill.querySelector("#global-status-label");
    if (labelEl) labelEl.textContent = label;
  }
  if (elements.apiStatusCount) {
    const statuses = Object.values(apiStatusRecord);
    const active = statuses.filter(status => status !== "idle").length;
    const online = statuses.filter(status => status === "online").length;
    elements.apiStatusCount.textContent = active > 0 ? `${online}/${active} online` : "";
  }
}

export function renderStats(events, lastUpdate) {
  const earthquakes = events.filter(event => event.type === "earthquake");
  const storms = events.filter(event => event.type === "storm");
  const winds = events.filter(event => event.type === "wind");
  const rains = events.filter(event => event.type === "rain");
  const floods = events.filter(event => FLOOD_TYPES.has(event.type));
  const fires = events.filter(event => event.type === "fire");
  const volcanoes = events.filter(event => event.type === "volcano");
  elements.earthquakeCount.textContent = earthquakes.length;
  elements.stormCount.textContent = storms.length;
  elements.windCount.textContent = winds.length;
  elements.rainCount.textContent = rains.length;
  elements.floodCount.textContent = floods.length;
  if (elements.fireCount) elements.fireCount.textContent = fires.length;
  if (elements.volcanoCount) elements.volcanoCount.textContent = volcanoes.length;
  if (elements.strongCount) elements.strongCount.textContent = earthquakes.filter(event => event.magnitude >= 5).length;
  elements.lastUpdate.textContent = lastUpdate || "--:--:--";
}

export function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function formatRelativeTime(date) {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min atras`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atras`;
  const days = Math.floor(hours / 24);
  return `${days}d atras`;
}

export function renderAlerts(events, onSelect) {
  elements.alertsList.replaceChildren();
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const recent = events.filter(event => new Date(event.timestamp).getTime() >= oneDayAgo);
  const sorted = [...recent].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 60);

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "alert-meta";
    empty.textContent = "Nenhum evento nas ultimas 24 horas.";
    elements.alertsList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  sorted.forEach(event => {
    const button = document.createElement("button");
    const isStorm = event.type === "storm";
    const isWind = event.type === "wind";
    const isRain = event.type === "rain";
    const isFire = event.type === "fire";
    const isVolcano = event.type === "volcano";
    const isFlood = FLOOD_TYPES.has(event.type);
    const isCivilDefense = event.type === "civil_defense";
    const isRecentCritical = isCriticalEvent(event);
    const importance = isRecentCritical ? "critical" : isCivilDefense ? "civil-defense" : isVolcano ? "volcano" : isStorm ? "storm" : isWind ? "wind" : isRain ? "rain" : isFire ? "fire" : isFlood ? "flood" : event.magnitude >= 5 ? "important" : event.magnitude >= 4 ? "moderate" : "";
    const offlineClass = event.offline ? "offline-alert" : "";
    button.className = `alert-item ${importance} ${offlineClass}`;
    button.type = "button";
    button.setAttribute("aria-label", `Abrir ${isCivilDefense ? `defesa civil - ${event.title}` : event.type === "storm" ? event.title : event.type === "wind" ? `vento em ${event.place}` : event.type === "rain" ? `chuva em ${event.place}` : event.type === "fire" ? `queimada` : event.type === "volcano" ? `vulcao ${event.title}` : event.type === "river_flood" ? `rio ${event.place}` : event.type === "flood_risk" ? `risco de enchente em ${event.place}` : event.place}`);
    const icon = isCivilDefense ? "shield-alert" : isStorm ? "cloud-lightning" : isWind ? "wind" : isRain ? "cloud-rain" : isFire ? "flame" : isVolcano ? "triangle-alert" : isFlood ? "alert-triangle" : event.magnitude >= 5 ? "triangle-alert" : "activity";
    let title;
    if (isCivilDefense) title = `${event.title} · ${event.municipio || ""}${event.uf ? "-" + event.uf : ""}`;
    else if (isStorm) title = event.title;
    else if (isWind) title = `Vento ${event.windSpeed.toFixed(0)} km/h · ${event.place}`;
    else if (isRain) title = `Chuva ${event.precipitation.toFixed(1)} mm/h · ${event.place}`;
    else if (isFire) title = `Foco de queimada · ${event.satellite || "?"}`;
    else if (isVolcano) title = `Alerta ${event.alertLevel} · ${event.title}`;
    else if (isFlood) {
      if (event.type === "river_flood") title = `Rio ${event.river || event.name} · Nivel ${event.currentLevel?.toFixed(2) || "?"}m (alerta ${event.alertLevel?.toFixed(2) || "?"}m)`;
      else if (event.type === "flood_risk") title = `Risco de enchente · ${event.rain24h?.toFixed(1) || 0}mm/24h`;
      else title = `Enchente · ${event.place}`;
    } else title = `M${event.magnitude.toFixed(1)} - ${event.place}`;
    const age = formatRelativeTime(new Date(event.timestamp));
    button.innerHTML = `
      <span class="alert-kind" aria-hidden="true"><i data-lucide="${icon}"></i></span>
      <span>
        <span class="alert-title">${escapeHtml(title)}</span>
        <span class="alert-meta">${escapeHtml(event.source)}${event.offline ? ' <span class="offline-tag">OFFLINE</span>' : ''} · ${age}</span>
      </span>
    `;
    button.addEventListener("click", () => onSelect(event));
    fragment.append(button);
  });
  elements.alertsList.append(fragment);
  refreshIcons();
}

export function readFilters() {
  return {
    earthquakes: elements.filterEarthquakes.checked,
    storms: elements.filterStorms.checked,
    winds: elements.filterWinds.checked,
    rain: elements.filterRain.checked,
    floods: elements.filterFloods?.checked ?? false,
    fires: elements.filterFires?.checked ?? false,
    volcanoes: elements.filterVolcanoes?.checked ?? false,
    civilDefense: elements.filterCivilDefense?.checked ?? false,
    minMagnitude: Number(elements.magnitudeFilter.value),
    period: elements.periodFilter.value
  };
}

export function renderBulletin(events, onSelect) {
  if (!elements.bulletinBody || !elements.bulletinSummary) return;
  const earthquakes = events
    .filter(event => event.type === "earthquake")
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 40);
  elements.bulletinBody.replaceChildren();
  if (!earthquakes.length) {
    const empty = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "alert-meta";
    cell.textContent = "Nenhum sismo registrado no periodo.";
    empty.append(cell);
    elements.bulletinBody.append(empty);
    elements.bulletinSummary.textContent = "Sem dados sismicos.";
    return;
  }
  const strongest = earthquakes.reduce((max, event) => (event.magnitude > max.magnitude ? event : max), earthquakes[0]);
  const totalEnergy = earthquakes.reduce(
    (sum, event) => sum + (seismicEnergy(event.magnitude).tonsTnt ?? 0),
    0
  );
  const summaryParts = [
    `${earthquakes.length} eventos nas ultimas 48h`,
    `maior M${strongest.magnitude.toFixed(1)} - ${strongest.place}`,
    `energia ≈ ${formatCompactNumber(totalEnergy)} t TNT (~${formatCompactNumber(totalEnergy / 20000, 2)} BA Hiroshima)`
  ];
  elements.bulletinSummary.textContent = summaryParts.join(" · ");
  const fragment = document.createDocumentFragment();
  earthquakes.forEach(event => {
    const style = getMagnitudeStyle(event.magnitude);
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.setAttribute("aria-label", `Localizar M${event.magnitude.toFixed(1)} em ${event.place}`);
    const timeCell = document.createElement("td");
    timeCell.textContent = formatTime(new Date(event.timestamp));
    const magCell = document.createElement("td");
    const dot = document.createElement("span");
    dot.className = "mag-dot";
    dot.style.background = style.color;
    magCell.append(dot, String(event.magnitude.toFixed(1)));
    const placeCell = document.createElement("td");
    placeCell.className = "bulletin-place";
    placeCell.title = `${event.place} · ${event.source}`;
    placeCell.textContent = event.place;
    const depthCell = document.createElement("td");
    depthCell.textContent = event.depth === null ? "--" : `${Math.round(event.depth)} km`;
    row.append(timeCell, magCell, placeCell, depthCell);
    const select = () => onSelect(event);
    row.addEventListener("click", select);
    row.addEventListener("keydown", keyboardEvent => {
      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
        keyboardEvent.preventDefault();
        select();
      }
    });
    fragment.append(row);
  });
  elements.bulletinBody.append(fragment);
}

function miniRow(label, value, detail = "") {
  const row = document.createElement("div");
  row.className = "mini-row";
  const labelElement = document.createElement("span");
  labelElement.className = "mini-label";
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  row.append(labelElement, valueElement);
  if (detail) {
    const detailElement = document.createElement("span");
    detailElement.className = "mini-detail";
    detailElement.textContent = detail;
    row.append(detailElement);
  }
  return row;
}

function formatTemperature(value, apparentValue = null) {
  if (value === null || value === undefined) return "--";
  const base = `${formatCompactNumber(value, 1)} °C`;
  if (apparentValue !== null && apparentValue !== undefined && Math.abs(apparentValue - value) >= 2) {
    return `${base} (sensacao ${formatCompactNumber(apparentValue, 1)} °C)`;
  }
  return base;
}

function placeLabel(observation) {
  if (!observation) return "";
  const name = observation.country ? `${observation.name} (${observation.country})` : observation.name;
  return name || `${observation.latitude?.toFixed(2)}, ${observation.longitude?.toFixed(2)}`;
}

export function renderClimateExtremes(extremes) {
  const container = elements.climateExtremes;
  if (!container) return;
  container.replaceChildren();
  if (!extremes) {
    const empty = document.createElement("p");
    empty.className = "alert-meta";
    empty.textContent = "Dados meteorologicos indisponiveis.";
    container.append(empty);
    return;
  }
  if (extremes.hottest) {
    container.append(miniRow(
      "Mais quente",
      formatTemperature(extremes.hottest.temperature, extremes.hottest.apparentTemperature),
      placeLabel(extremes.hottest)
    ));
  }
  if (extremes.coldest) {
    container.append(miniRow(
      "Mais frio",
      formatTemperature(extremes.coldest.temperature),
      placeLabel(extremes.coldest)
    ));
  }
  if (extremes.strongestGust && extremes.strongestGust.windGusts !== null) {
    container.append(miniRow(
      "Rajada maxima",
      `${formatCompactNumber(extremes.strongestGust.windGusts, 0)} km/h`,
      placeLabel(extremes.strongestGust)
    ));
  }
  if (extremes.heaviestRain && extremes.heaviestRain.precipitation !== null) {
    container.append(miniRow(
      "Chuva mais intensa",
      `${formatCompactNumber(extremes.heaviestRain.precipitation, 1)} mm/h`,
      placeLabel(extremes.heaviestRain)
    ));
  }
}

export function renderSolar(solar) {
  const container = elements.solarBulletin;
  if (!container) return;
  container.replaceChildren();
  const kp = solar?.kp ?? null;
  const flares = solar?.flares ?? null;
  if (!kp && !flares) {
    const empty = document.createElement("p");
    empty.className = "alert-meta";
    empty.textContent = "Dados solares indisponiveis.";
    container.append(empty);
    return;
  }
  if (flares?.largest) {
    const time = flares.largest.timeTag ? ` · ${formatTime(new Date(flares.largest.timeTag))}` : "";
    container.append(miniRow(
      "Maior rajada X (24h)",
      flares.largest.classLabel,
      `canal 0.1-0.8 nm${time}`
    ));
  } else {
    container.append(miniRow("Maior rajada X (24h)", "Nenhuma classe C+"));
  }
  container.append(miniRow(
    "Eventos M+ / X+ (24h)",
    `${flares?.mClassCount ?? 0} / ${flares?.xClassCount ?? 0}`
  ));
  if (kp) {
    container.append(miniRow(
      "Indice Kp agora",
      `${kp.latest.kp.toFixed(1)}`,
      `max 24h ${kp.max24h.toFixed(1)}`
    ));
    container.append(miniRow("Campo geomagnetico", kpLevel(kp.latest.kp)));
  }
}
