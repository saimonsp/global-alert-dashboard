const STORAGE_KEY = "globalAlertDashboard_settings";

const DEFAULTS = {
  theme: "dark",
  accent: "#4cc9c0",
  fontSize: 14,
  animations: true,
  mapStyle: "cartodark",
  markerSize: 1,
  heatOverlay: true,
  cluster: false,
  sources: {
    usgs: true,
    eonet: true,
    openmeteo: true,
    inmet: true,
    solar: true,
    fires: true,
    volcanoes: true,
    floods: true,
    civilDefense: true
  },
  offline: {
    nwr_rtlsdr: { enabled: false, endpoint: "ws://localhost:8081", label: "NWR (RTL-SDR)" },
    goes_satellite: { enabled: false, endpoint: "ws://localhost:8082", label: "GOES (Satelite)" },
    meshtastic_lora: { enabled: false, endpoint: "ws://localhost:8083", label: "Meshtastic (LoRa)" },
    hf_radio: { enabled: false, endpoint: "ws://localhost:8084", label: "HF (Ondas Curtas)" }
  },
  notifications: false,
  sound: true,
  criticalOnly: false,
  refreshInterval: 60,
  autoRefresh: true,
  tvRotation: 30,
  tvBurnin: true
};

let settings = { ...DEFAULTS };
let listeners = [];

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const mergedOffline = {};
      for (const key of Object.keys(DEFAULTS.offline)) {
        mergedOffline[key] = { ...DEFAULTS.offline[key], ...(parsed.offline?.[key] || {}) };
      }
      settings = { ...DEFAULTS, ...parsed, sources: { ...DEFAULTS.sources, ...parsed.sources }, offline: mergedOffline };
    }
  } catch {
    settings = { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export function getSettings() {
  return settings;
}

export function onSettingsChange(callback) {
  listeners.push(callback);
  return () => { listeners = listeners.filter(fn => fn !== callback); };
}

function notify(key, value) {
  listeners.forEach(fn => fn(key, value, settings));
}

function set(key, value) {
  settings[key] = value;
  saveSettings();
  notify(key, value);
}

function setSource(source, enabled) {
  settings.sources[source] = enabled;
  saveSettings();
  notify("source", { source, enabled, sources: settings.sources });
}

function setOffline(key, patch) {
  settings.offline[key] = { ...settings.offline[key], ...patch };
  saveSettings();
  notify("offline", { key, config: settings.offline[key], offline: settings.offline });
}

function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove("theme-dark", "theme-light", "theme-amoled");
  if (theme === "light") html.classList.add("theme-light");
  else if (theme === "amoled") html.classList.add("theme-amoled");
}

function applyAccent(color) {
  document.documentElement.style.setProperty("--accent", color);
}

function applyFontSize(size) {
  document.documentElement.style.fontSize = `${size}px`;
}

function applyAnimations(enabled) {
  document.documentElement.classList.toggle("no-animations", !enabled);
}

export function openDrawer() {
  const overlay = document.getElementById("settings-overlay");
  const drawer = document.getElementById("settings-drawer");
  if (!overlay || !drawer) return;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}

export function closeDrawer() {
  const overlay = document.getElementById("settings-overlay");
  const drawer = document.getElementById("settings-drawer");
  if (!overlay || !drawer) return;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function syncUI() {
  document.querySelectorAll(".theme-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.theme === settings.theme);
  });
  document.querySelectorAll(".accent-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.accent === settings.accent);
  });
  const fontSizeInput = document.getElementById("setting-font-size");
  const fontSizeValue = document.getElementById("setting-font-size-value");
  if (fontSizeInput) fontSizeInput.value = settings.fontSize;
  if (fontSizeValue) fontSizeValue.textContent = `${settings.fontSize}px`;

  const animationsInput = document.getElementById("setting-animations");
  if (animationsInput) animationsInput.checked = settings.animations;

  const mapStyleInput = document.getElementById("setting-map-style");
  if (mapStyleInput) mapStyleInput.value = settings.mapStyle;

  const markerSizeInput = document.getElementById("setting-marker-size");
  const markerSizeValue = document.getElementById("setting-marker-size-value");
  if (markerSizeInput) markerSizeInput.value = settings.markerSize;
  if (markerSizeValue) markerSizeValue.textContent = `${settings.markerSize.toFixed(1)}x`;

  const heatOverlayInput = document.getElementById("setting-heat-overlay");
  if (heatOverlayInput) heatOverlayInput.checked = settings.heatOverlay;

  const clusterInput = document.getElementById("setting-cluster");
  if (clusterInput) clusterInput.checked = settings.cluster;

  Object.keys(settings.sources).forEach(source => {
    const el = document.getElementById(`setting-source-${source}`);
    if (el) el.checked = settings.sources[source];
  });

  const notificationsInput = document.getElementById("setting-notifications");
  if (notificationsInput) notificationsInput.checked = settings.notifications;

  const soundInput = document.getElementById("setting-sound");
  if (soundInput) soundInput.checked = settings.sound;

  const criticalOnlyInput = document.getElementById("setting-critical-only");
  if (criticalOnlyInput) criticalOnlyInput.checked = settings.criticalOnly;

  const refreshInput = document.getElementById("setting-refresh-interval");
  if (refreshInput) refreshInput.value = String(settings.refreshInterval);

  const autoRefreshInput = document.getElementById("setting-auto-refresh");
  if (autoRefreshInput) autoRefreshInput.checked = settings.autoRefresh;

  const tvRotationInput = document.getElementById("setting-tv-rotation");
  if (tvRotationInput) tvRotationInput.value = String(settings.tvRotation);

  const tvBurninInput = document.getElementById("setting-tv-burnin");
  if (tvBurninInput) tvBurninInput.checked = settings.tvBurnin;

  Object.keys(settings.offline).forEach(key => {
    const cfg = settings.offline[key];
    const toggle = document.getElementById(`offline-${key}-enabled`);
    const endpoint = document.getElementById(`offline-${key}-endpoint`);
    if (toggle) toggle.checked = cfg.enabled;
    if (endpoint) endpoint.value = cfg.endpoint;
  });
}

function bindEvents() {
  const settingsButton = document.getElementById("settings-button");
  const closeButton = document.getElementById("settings-close");
  const overlay = document.getElementById("settings-overlay");

  settingsButton?.addEventListener("click", () => {
    syncUI();
    openDrawer();
  });
  closeButton?.addEventListener("click", closeDrawer);
  overlay?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      const drawer = document.getElementById("settings-drawer");
      if (drawer?.classList.contains("open")) closeDrawer();
    }
  });

  document.querySelectorAll(".theme-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const theme = btn.dataset.theme;
      set("theme", theme);
      applyTheme(theme);
      syncUI();
    });
  });

  document.querySelectorAll(".accent-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const color = btn.dataset.accent;
      set("accent", color);
      applyAccent(color);
      syncUI();
    });
  });

  const fontSizeInput = document.getElementById("setting-font-size");
  fontSizeInput?.addEventListener("input", () => {
    const val = Number(fontSizeInput.value);
    set("fontSize", val);
    applyFontSize(val);
    const label = document.getElementById("setting-font-size-value");
    if (label) label.textContent = `${val}px`;
  });

  const animationsInput = document.getElementById("setting-animations");
  animationsInput?.addEventListener("change", () => {
    set("animations", animationsInput.checked);
    applyAnimations(animationsInput.checked);
  });

  const mapStyleInput = document.getElementById("setting-map-style");
  mapStyleInput?.addEventListener("change", () => {
    set("mapStyle", mapStyleInput.value);
  });

  const markerSizeInput = document.getElementById("setting-marker-size");
  markerSizeInput?.addEventListener("input", () => {
    const val = Number(markerSizeInput.value);
    set("markerSize", val);
    const label = document.getElementById("setting-marker-size-value");
    if (label) label.textContent = `${val.toFixed(1)}x`;
  });

  const heatOverlayInput = document.getElementById("setting-heat-overlay");
  heatOverlayInput?.addEventListener("change", () => {
    set("heatOverlay", heatOverlayInput.checked);
  });

  const clusterInput = document.getElementById("setting-cluster");
  clusterInput?.addEventListener("change", () => {
    set("cluster", clusterInput.checked);
  });

  document.querySelectorAll("[data-source]").forEach(input => {
    input.addEventListener("change", () => {
      setSource(input.dataset.source, input.checked);
    });
  });

  const notificationsInput = document.getElementById("setting-notifications");
  notificationsInput?.addEventListener("change", async () => {
    if (notificationsInput.checked && "Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        notificationsInput.checked = false;
        set("notifications", false);
        return;
      }
    }
    set("notifications", notificationsInput.checked);
  });

  const soundInput = document.getElementById("setting-sound");
  soundInput?.addEventListener("change", () => {
    set("sound", soundInput.checked);
  });

  const criticalOnlyInput = document.getElementById("setting-critical-only");
  criticalOnlyInput?.addEventListener("change", () => {
    set("criticalOnly", criticalOnlyInput.checked);
  });

  const refreshInput = document.getElementById("setting-refresh-interval");
  refreshInput?.addEventListener("change", () => {
    set("refreshInterval", Number(refreshInput.value));
  });

  const autoRefreshInput = document.getElementById("setting-auto-refresh");
  autoRefreshInput?.addEventListener("change", () => {
    set("autoRefresh", autoRefreshInput.checked);
  });

  const tvRotationInput = document.getElementById("setting-tv-rotation");
  tvRotationInput?.addEventListener("change", () => {
    set("tvRotation", Number(tvRotationInput.value));
  });

  const tvBurninInput = document.getElementById("setting-tv-burnin");
  tvBurninInput?.addEventListener("change", () => {
    set("tvBurnin", tvBurninInput.checked);
  });

  document.querySelectorAll("[data-offline-key]").forEach(input => {
    const key = input.dataset.offlineKey;
    const field = input.dataset.offlineField;
    input.addEventListener("change", () => {
      const patch = field === "enabled" ? { enabled: input.checked } : { endpoint: input.value };
      setOffline(key, patch);
    });
  });
}

export function initSettings() {
  loadSettings();
  applyTheme(settings.theme);
  applyAccent(settings.accent);
  applyFontSize(settings.fontSize);
  applyAnimations(settings.animations);
  bindEvents();
  return settings;
}
