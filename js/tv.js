import { focusEvent, fitWorld, fitBrazil } from "./map.js";
import { formatTime, isCriticalEvent, FLOOD_TYPES } from "./utils.js";

const ROTATION_INTERVAL_MS = 25 * 1000;
const CLOCK_INTERVAL_MS = 1000;
const STALE_DATA_MS = 15 * 60 * 1000;
const WATCHDOG_CHECK_MS = 60 * 1000;
const WATCHDOG_RELOAD_MS = 30 * 60 * 1000;
const BURN_SHIFT_INTERVAL_MS = 90 * 1000;
const CURSOR_IDLE_MS = 5000;
const FS_HINT_TIMEOUT_MS = 12000;
const BURN_OFFSETS = [[0, 0], [3, 0], [-3, 2], [0, -2]];

let rotationTimer = null;
let rotationIndex = 0;
let criticalEvents = [];
let lastTickerSignature = "";
let burnIndex = 0;
let cursorTimer = null;
let lastSuccessfulUpdate = null;

export function isTvMode() {
  return new URLSearchParams(window.location.search).get("tv") === "1";
}

const isCritical = isCriticalEvent;

function symbolFor(event) {
  if (event.type === "storm") return "◉";
  if (event.type === "wind") return "◈";
  if (event.type === "rain") return "◍";
  if (event.type === "volcano") return "🔺";
  if (FLOOD_TYPES.has(event.type)) return "≋";
  return "●";
}

function labelFor(event) {
  if (event.type === "storm") return event.title;
  if (event.type === "wind") return `Vento ${event.windSpeed.toFixed(0)} km/h - ${event.place}`;
  if (event.type === "rain") return `Chuva ${event.precipitation.toFixed(1)} mm/h - ${event.place}`;
  if (event.type === "volcano") return `Vulcao ${event.title} - ${event.alertLevel}`;
  if (event.type === "river_flood") return `Rio ${event.river || event.name} - risco ${event.riskLevel}`;
  if (event.type === "flood_risk") return `Risco enchente - ${event.rain24h?.toFixed(1) || 0}mm/24h`;
  return `Terremoto M${event.magnitude.toFixed(1)} - ${event.place}`;
}

function setupClock() {
  const clock = document.getElementById("tv-clock");
  if (!clock) return;
  const timeElement = clock.querySelector("strong");
  const dateElement = clock.querySelector("span");
  const tick = () => {
    const now = new Date();
    timeElement.textContent = formatTime(now);
    dateElement.textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(now);
  };
  tick();
  setInterval(tick, CLOCK_INTERVAL_MS);
}

function setupFullscreen() {
  const hint = document.getElementById("fs-hint");
  const request = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  window.addEventListener("click", request, { once: true });
  window.addEventListener("keydown", request, { once: true });
  const dismissHint = () => hint?.classList.add("hidden");
  hint?.classList.remove("hidden");
  document.addEventListener("fullscreenchange", dismissHint);
  setTimeout(dismissHint, FS_HINT_TIMEOUT_MS);
}

function resetCursor() {
  document.body.classList.remove("hide-cursor");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add("hide-cursor"), CURSOR_IDLE_MS);
}

function setupCursorHide() {
  ["mousemove", "mousedown", "keydown"].forEach(type => window.addEventListener(type, resetCursor));
  resetCursor();
}

function setupActivityControls() {
  const exitButton = document.getElementById("tv-exit");
  let hideButtonTimer = null;
  const showExitButton = () => {
    if (!exitButton) return;
    exitButton.classList.add("visible");
    clearTimeout(hideButtonTimer);
    hideButtonTimer = setTimeout(() => exitButton.classList.remove("visible"), 3000);
  };
  window.addEventListener("mousemove", showExitButton);
  showExitButton();
  exitButton?.addEventListener("click", () => {
    window.location.href = window.location.pathname;
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") window.location.href = window.location.pathname;
  });
}

function setupWatchdog() {
  const badge = document.getElementById("offline-badge");
  window.addEventListener("offline", () => badge?.classList.remove("hidden"));
  window.addEventListener("online", () => badge?.classList.add("hidden"));
  setInterval(() => {
    if (!navigator.onLine) {
      badge?.classList.remove("hidden");
      return;
    }
    badge?.classList.add("hidden");
    if (lastSuccessfulUpdate && Date.now() - lastSuccessfulUpdate.getTime() > WATCHDOG_RELOAD_MS) {
      console.warn("Modo TV: sem dados novos por muito tempo. Recarregando pagina.");
      window.location.reload();
    }
  }, WATCHDOG_CHECK_MS);
  scheduleNightlyReload();
}

function scheduleNightlyReload() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(4, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(() => window.location.reload(), next.getTime() - now.getTime());
}

function setupBurnInShift() {
  setInterval(() => {
    burnIndex = (burnIndex + 1) % BURN_OFFSETS.length;
    const [x, y] = BURN_OFFSETS[burnIndex];
    document.querySelectorAll(".topbar, .legend, .ticker").forEach(element => {
      element.style.setProperty("--burn-x", `${x}px`);
      element.style.setProperty("--burn-y", `${y}px`);
    });
  }, BURN_SHIFT_INTERVAL_MS);
}

function startRotation() {
  clearInterval(rotationTimer);
  rotationTimer = setInterval(() => {
    if (document.hidden) return;
    const steps = [fitWorld, fitBrazil];
    if (criticalEvents.length) {
      steps.push(() => focusEvent(criticalEvents[rotationIndex % criticalEvents.length]));
    }
    const step = steps[rotationIndex % steps.length];
    rotationIndex += 1;
    try {
      step();
    } catch (error) {
      console.warn("Rotacao do mapa falhou", error);
    }
  }, ROTATION_INTERVAL_MS);
}

function updateCriticalBanner(events) {
  const banner = document.getElementById("critical-banner");
  if (!banner) return;
  if (!events.length) {
    banner.classList.add("hidden");
    banner.replaceChildren();
    return;
  }
  banner.classList.remove("hidden");
  banner.replaceChildren();
  const tag = document.createElement("strong");
  tag.textContent = "ALERTAS CRITICOS";
  banner.append(tag);
  events.slice(0, 5).forEach(event => {
    const span = document.createElement("span");
    span.textContent = labelFor(event);
    banner.append(span);
  });
}

function updateTicker(events) {
  const track = document.getElementById("ticker-track");
  if (!track) return;
  const items = [...events]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 25);
  if (!items.length) {
    track.replaceChildren();
    lastTickerSignature = "";
    return;
  }
  const signature = items.map(item => `${item.id}:${item.timestamp}`).join("|");
  if (signature === lastTickerSignature) return;
  lastTickerSignature = signature;
  const buildSequence = () => {
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const span = document.createElement("span");
      span.className = `ticker-item ticker-${item.type}`;
      span.textContent = `${symbolFor(item)} ${labelFor(item)} · ${formatTime(new Date(item.timestamp))}`;
      fragment.append(span);
    });
    return fragment;
  };
  track.replaceChildren(buildSequence(), buildSequence());
}

function updateDataAge(lastUpdate) {
  const element = document.getElementById("last-update");
  if (!element) return;
  const stale = !lastUpdate || Date.now() - lastUpdate.getTime() > STALE_DATA_MS;
  element.classList.toggle("stale", stale);
}

export function initTvMode() {
  if (!isTvMode()) return null;
  document.documentElement.classList.add("tv-mode");
  setupClock();
  setupFullscreen();
  setupCursorHide();
  setupActivityControls();
  setupWatchdog();
  setupBurnInShift();
  startRotation();
  return {
    sync(events, lastUpdate) {
      criticalEvents = events.filter(isCritical);
      updateCriticalBanner(criticalEvents);
      updateTicker(events);
      updateDataAge(lastUpdate);
      if (lastUpdate) lastSuccessfulUpdate = lastUpdate;
    }
  };
}
