import { isFiniteNumber, parseNumber } from "./utils.js";
import { fetchJsonRetry } from "./http.js";

const SWPC_BASE = "https://services.swpc.noaa.gov";
const XRAY_1_DAY_URL = `${SWPC_BASE}/json/goes/primary/xrays-1-day.json`;
const PLANETARY_K_INDEX_URL = `${SWPC_BASE}/products/noaa-planetary-k-index.json`;

export function classifyXRayFlux(flux) {
  const value = parseNumber(flux);
  if (value === null || value <= 0) return null;
  if (value >= 1e-4) return { letter: "X", power: value / 1e-4 };
  if (value >= 1e-5) return { letter: "M", power: value / 1e-5 };
  if (value >= 1e-6) return { letter: "C", power: value / 1e-6 };
  if (value >= 1e-7) return { letter: "B", power: value / 1e-7 };
  return { letter: "A", power: value / 1e-8 };
}

export function normalizeXRayFlares(data) {
  const list = Array.isArray(data) ? data : [];
  let largest = null;
  let mClassCount = 0;
  let xClassCount = 0;
  let sampleCount = 0;
  list.forEach(item => {
    if (!item || item.energy !== "0.1-0.8nm") return;
    sampleCount += 1;
    const classification = classifyXRayFlux(item.flux);
    if (!classification) return;
    const flux = parseNumber(item.flux);
    if (classification.letter === "M") mClassCount += 1;
    if (classification.letter === "X") xClassCount += 1;
    if (!largest || flux > largest.flux) {
      largest = {
        flux,
        classLabel: `${classification.letter}${classification.power.toFixed(1)}`,
        timeTag: item.time_tag ?? null
      };
    }
  });
  return { largest, mClassCount, xClassCount, sampleCount };
}

export function normalizeKpIndex(data) {
  const rows = Array.isArray(data) ? data.filter(Array.isArray) : [];
  const entries = [];
  rows.forEach(row => {
    const timeTag = typeof row[0] === "string" ? row[0] : null;
    if (!timeTag) return;
    for (let index = 1; index < row.length; index++) {
      const kp = parseNumber(row[index]);
      if (kp !== null && kp >= 0 && kp <= 9) {
        entries.push({ timeTag, kp });
        break;
      }
    }
  });
  if (!entries.length) return null;
  const latest = entries[entries.length - 1];
  const last24h = entries.slice(-8);
  const max24h = last24h.reduce((max, entry) => Math.max(max, entry.kp), 0);
  return { latest, max24h };
}

export function kpLevel(kp) {
  const value = parseNumber(kp);
  if (value === null) return "indisponivel";
  if (value >= 9) return "G5 - tempestade extrema";
  if (value >= 8) return "G4 - tempestade severa";
  if (value >= 7) return "G3 - tempestade forte";
  if (value >= 6) return "G2 - tempestade moderada";
  if (value >= 5) return "G1 - tempestade fraca";
  if (value >= 4) return "campo instavel";
  return "calmo";
}

export async function fetchSolarActivity() {
  const data = await fetchJsonRetry(XRAY_1_DAY_URL, { timeoutMs: 15000, retries: 1 });
  return normalizeXRayFlares(data);
}

export async function fetchKpIndex() {
  const data = await fetchJsonRetry(PLANETARY_K_INDEX_URL, { timeoutMs: 15000, retries: 1 });
  return normalizeKpIndex(data);
}
