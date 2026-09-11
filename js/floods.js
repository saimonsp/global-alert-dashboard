import { isValidCoordinate } from "./utils.js";

const FLOOD_RISK_THRESHOLDS = {
  low: { rain24h: 50, rain72h: 80, riverLevel: 0.6 },
  moderate: { rain24h: 80, rain72h: 120, riverLevel: 0.75 },
  high: { rain24h: 120, rain72h: 180, riverLevel: 0.9 }
};

export const FLOOD_RISK_LEVELS = { ...FLOOD_RISK_THRESHOLDS };

function floodRiskLevel(rain24h, rain72h, riverRatio) {
  if (rain24h >= FLOOD_RISK_THRESHOLDS.high.rain24h ||
      rain72h >= FLOOD_RISK_THRESHOLDS.high.rain72h ||
      riverRatio >= FLOOD_RISK_THRESHOLDS.high.riverLevel) {
    return "high";
  }
  if (rain24h >= FLOOD_RISK_THRESHOLDS.moderate.rain24h ||
      rain72h >= FLOOD_RISK_THRESHOLDS.moderate.rain72h ||
      riverRatio >= FLOOD_RISK_THRESHOLDS.moderate.riverLevel) {
    return "moderate";
  }
  if (rain24h >= FLOOD_RISK_THRESHOLDS.low.rain24h ||
      rain72h >= FLOOD_RISK_THRESHOLDS.low.rain72h ||
      riverRatio >= FLOOD_RISK_THRESHOLDS.low.riverLevel) {
    return "low";
  }
  return "none";
}

function buildFloodRiskFromRain(observations) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const threeDaysMs = 3 * dayMs;

  const riskPoints = observations.map(obs => {
    if (!obs.precipitationHistory) return null;
    const rain24h = obs.precipitationHistory
      .filter(p => now - p.time <= dayMs)
      .reduce((sum, p) => sum + (p.value || 0), 0);
    const rain72h = obs.precipitationHistory
      .filter(p => now - p.time <= threeDaysMs)
      .reduce((sum, p) => sum + (p.value || 0), 0);
    const level = floodRiskLevel(rain24h, rain72h, 0);
    if (level === "none") return null;
    return {
      id: `risk-${obs.latitude.toFixed(2)},${obs.longitude.toFixed(2)}`,
      type: "flood_risk",
      scope: "regional",
      latitude: obs.latitude,
      longitude: obs.longitude,
      name: `${obs.name} (risco de enchente)`,
      riskLevel: level,
      rain24h,
      rain72h,
      timestamp: new Date().toISOString(),
      source: "Open-Meteo (análise de precipitação)"
    };
  }).filter(Boolean);
  return riskPoints;
}

export async function fetchFloodData(observations = []) {
  const risks = buildFloodRiskFromRain(observations);
  return { rivers: [], risks };
}

export function filterFloodEvents(events, minLevel = "low") {
  const order = { none: 0, low: 1, moderate: 2, high: 3 };
  const minOrder = order[minLevel] || 1;
  return events.filter(event =>
    event.riskLevel && order[event.riskLevel] >= minOrder
  );
}
