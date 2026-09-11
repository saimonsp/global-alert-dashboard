export function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

export function parseNumber(value) {
  const parsed = parseFloat(String(value).replace(",", "."));
  return isFiniteNumber(parsed) ? parsed : null;
}

export const FLOOD_TYPES = new Set(["river_flood", "flash_flood", "urban_flood", "flood_risk"]);

export function isCriticalEvent(event) {
  if (!event) return false;
  if (event.type === "earthquake") {
    const mag = event.magnitude ?? 0;
    const depth = event.depth ?? 100;
    if (mag >= 6) return true;
    if (mag >= 5 && depth < 70) return true;
    if (mag >= 4.5 && depth < 30) return true;
    return false;
  }
  if (event.type === "wind") {
    const speed = event.windSpeed ?? 0;
    const gusts = event.windGusts ?? 0;
    return Math.max(speed, gusts) >= 90;
  }
  if (event.type === "rain") {
    return (event.precipitation ?? 0) >= 10;
  }
  if (event.type === "storm") {
    return (event.magnitudeValue ?? 0) >= 4 || /cat[eogry]*\s*[45]/i.test(event.category || "");
  }
  if (event.type === "volcano") {
    const level = String(event.alertLevel || "").trim().toLowerCase();
    return level === "warning" || level === "watch";
  }
  if (FLOOD_TYPES.has(event.type)) {
    return event.riskLevel === "high";
  }
  return false;
}

export function earthquakeRiskLabel(magnitude, depth) {
  const mag = Number(magnitude) || 0;
  const d = Number(depth) ?? 100;
  if (mag >= 7) return { level: "extreme", label: "Extremo" };
  if (mag >= 6) return { level: "very-high", label: "Muito alto" };
  if (mag >= 5 && d < 70) return { level: "high", label: "Alundo (raso)" };
  if (mag >= 5) return { level: "high", label: "Alto" };
  if (mag >= 4.5 && d < 30) return { level: "moderate", label: "Moderado (raso)" };
  if (mag >= 4) return { level: "moderate", label: "Moderado" };
  return { level: "low", label: "Baixo" };
}

export function isValidCoordinate(latitude, longitude) {
  return isFiniteNumber(latitude) && isFiniteNumber(longitude) &&
    Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number(longitude) >= -180 && Number(longitude) <= 180;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function formatDateTime(timestamp) {
  if (!timestamp) return "Indisponivel";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Indisponivel";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(date);
}

export function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(date);
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) return null;
  const toRad = degrees => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function withinPeriod(timestamp, period, now = Date.now()) {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return false;
  const hours = period === "6h" ? 6 : period === "7d" ? 24 * 7 : 24;
  return now - time <= hours * 60 * 60 * 1000;
}

export function filterEvents(events, filters, now = Date.now()) {
  const floodTypes = new Set(["river_flood", "flash_flood", "urban_flood", "flood_risk"]);
  return events.filter(event => {
    if (event.type === "earthquake" && !filters.earthquakes) return false;
    if (event.type === "storm" && !filters.storms) return false;
    if (event.type === "wind" && !filters.winds) return false;
    if (event.type === "rain" && !filters.rain) return false;
    if (floodTypes.has(event.type) && !filters.floods) return false;
    if (event.type === "fire" && !filters.fires) return false;
    if (event.type === "volcano" && !filters.volcanoes) return false;
    if (event.type === "earthquake" && Number(event.magnitude) < Number(filters.minMagnitude)) return false;
    return withinPeriod(event.timestamp, filters.period, now);
  });
}

const JOULES_PER_TON_TNT = 4.184e9;
const HIROSHIMA_TONS_TNT = 20000;

export function seismicEnergy(magnitude) {
  const value = Number(magnitude);
  if (!isFiniteNumber(value)) return { tonsTnt: null, hiroshimas: null };
  const joules = 10 ** (1.5 * value + 4.8);
  const tonsTnt = joules / JOULES_PER_TON_TNT;
  return { tonsTnt, hiroshimas: tonsTnt / HIROSHIMA_TONS_TNT };
}

export function formatCompactNumber(value, maxDigits = 1) {
  const parsed = Number(value);
  if (!isFiniteNumber(parsed)) return "--";
  const digits = Math.abs(parsed) >= 1000 ? 0 : maxDigits;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(parsed);
}
