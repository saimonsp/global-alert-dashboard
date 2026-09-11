import { calculateDistance } from "./utils.js";

const ALARM_RADIUS_KM = 150;
const ALARM_COOLDOWN_MS = 5 * 60 * 1000;
let audioCtx = null;
let userLocation = null;
let locationWatchId = null;
let lastAlarmTime = {};
let notificationPermission = "default";
let soundEnabled = true;

export function initAlertSystem() {
  requestNotificationPermission();
  startLocationTracking();
}

function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    notificationPermission = "granted";
    return;
  }
  if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      notificationPermission = permission;
    });
  }
}

function startLocationTracking() {
  if (!navigator.geolocation) return;
  locationWatchId = navigator.geolocation.watchPosition(
    position => {
      userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    },
    () => {},
    { enableHighAccuracy: false, timeout: 30000, maximumAge: 300000 }
  );
}

export function getUserLocation() {
  return userLocation;
}

export function checkRegionalAlerts(events) {
  if (!userLocation) return [];
  const now = Date.now();
  return events.filter(event => {
    const distance = calculateDistance(
      userLocation.latitude, userLocation.longitude,
      event.latitude, event.longitude
    );
    if (distance === null || distance > ALARM_RADIUS_KM) return false;
    const eventTime = new Date(event.timestamp).getTime();
    if (now - eventTime > 60 * 60 * 1000) return false;
    const alarmKey = `${event.type}-${event.id}`;
    if (lastAlarmTime[alarmKey] && now - lastAlarmTime[alarmKey] < ALARM_COOLDOWN_MS) return false;
    lastAlarmTime[alarmKey] = now;
    return true;
  });
}

export function playAlarm(event) {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const isHigh = event.type === "earthquake" && event.magnitude >= 5
      || event.type === "storm"
      || event.type === "wind" && event.windSpeed >= 90
      || event.type === "rain" && event.precipitation >= 20;

    const freq = isHigh ? [880, 660, 880] : [660, 440, 660];
    const duration = isHigh ? 0.5 : 0.3;
    let t = audioCtx.currentTime;

    freq.forEach(f => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duration);
      t += duration;
    });
  } catch {}
}

export function sendNotification(event) {
  if (notificationPermission !== "granted") return;
  const title = eventTitle(event);
  const body = eventBody(event);
  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: `alert-${event.id}`,
      requireInteraction: true
    });
  } catch {}
}

function eventTitle(event) {
  switch (event.type) {
    case "earthquake": return `Terremoto M${event.magnitude?.toFixed(1)}`;
    case "storm": return `Tempestade: ${event.title}`;
    case "wind": return `Vento forte: ${event.windSpeed?.toFixed(0)} km/h`;
    case "rain": return `Chuva intensa: ${event.precipitation?.toFixed(1)} mm/h`;
    case "fire": return `Foco de queimada detectado`;
    case "river_flood": return `Enchente: Rio ${event.river || event.name}`;
    case "flood_risk": return `Risco de enchente`;
    default: return "Alerta natural";
  }
}

function eventBody(event) {
  const place = event.place || event.name || "";
  const source = event.source || "";
  if (event.type === "fire") return `Satelite: ${event.satellite || "?"} · ${source}`;
  return `${place} · ${source}`;
}

export function clearAlertSystem() {
  if (locationWatchId !== null) {
    navigator.geolocation?.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  lastAlarmTime = {};
}

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
}
