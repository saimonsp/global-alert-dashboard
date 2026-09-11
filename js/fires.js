import { isValidCoordinate, parseNumber } from "./utils.js";

const INPE_FIRES_BASE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/10min";
const FIRE_POLL_MS = 10 * 60 * 1000;
let lastFireFetch = 0;
let fireCooldownUntil = 0;
const FIRE_COOLDOWN_MS = 5 * 60 * 1000;

function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatTime(date) {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}${m}`;
}

function findLatestCsvUrl() {
  const now = new Date();
  const urls = [];
  for (let i = 0; i < 12; i++) {
    const t = new Date(now.getTime() - i * 10 * 60 * 1000);
    const minutes = Math.floor(t.getUTCMinutes() / 10) * 10;
    t.setUTCMinutes(minutes, 0, 0);
    const dateStr = formatDate(t);
    const timeStr = formatTime(t);
    urls.push(`${INPE_FIRES_BASE}/focos_10min_${dateStr}_${timeStr}.csv`);
  }
  return urls;
}

function parseCsvFires(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];
  const fires = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map(s => s.trim());
    if (parts.length < 4) continue;
    const lat = parseNumber(parts[0]);
    const lon = parseNumber(parts[1]);
    const satellite = parts[2] || "";
    const timestamp = parts[3] || "";
    if (lat === null || lon === null || !isValidCoordinate(lat, lon)) continue;
    fires.push({
      id: `fire-${lat.toFixed(3)},${lon.toFixed(3)}`,
      type: "fire",
      latitude: lat,
      longitude: lon,
      satellite,
      timestamp: timestamp.replace(" ", "T") + "Z",
      source: "INPE Queimadas"
    });
  }
  return fires;
}

export async function fetchFires() {
  if (Date.now() < fireCooldownUntil) return [];
  if (Date.now() - lastFireFetch < FIRE_POLL_MS && lastFireFetch > 0) return [];

  const urls = findLatestCsvUrl();
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) continue;
      const text = await response.text();
      if (!text || !text.trim() || text.includes("<!DOCTYPE")) continue;
      const fires = parseCsvFires(text);
      if (fires.length > 0) {
        lastFireFetch = Date.now();
        return fires;
      }
    } catch {
      continue;
    }
  }
  fireCooldownUntil = Date.now() + FIRE_COOLDOWN_MS;
  console.warn("INPE Queimadas: nenhuma resposta valida");
  return [];
}

export function shouldPollFires() {
  return Date.now() - lastFireFetch >= FIRE_POLL_MS;
}
