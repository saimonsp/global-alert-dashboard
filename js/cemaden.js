import { isValidCoordinate } from "./utils.js";

const CEMADEN_API = "https://painelalertas.cemaden.gov.br/wsAlertas2";
const CEMADEN_POLL_MS = 15 * 60 * 1000;
let lastFetch = 0;
let cooldownUntil = 0;
const COOLDOWN_MS = 10 * 60 * 1000;

function classifyCivilDefenseLevel(level) {
  const norm = String(level || "").toLowerCase();
  if (norm === "muito alto" || norm === "extremo") return "critical";
  if (norm === "alto") return "important";
  if (norm === "moderado") return "moderate";
  return "normal";
}

export function normalizeCivilDefenseAlerts(data) {
  if (!data || !Array.isArray(data.alertas)) return [];
  return data.alertas
    .filter(alert => alert.latitude != null && alert.longitude != null && alert.status === 1)
    .map(alert => {
      const latitude = Number(alert.latitude);
      const longitude = Number(alert.longitude);
      if (!isValidCoordinate(latitude, longitude)) return null;
      return {
        id: `cemaden-${alert.cod_alerta}`,
        type: "civil_defense",
        latitude,
        longitude,
        title: alert.evento || "Alerta Defesa Civil",
        municipio: alert.municipio || "",
        uf: alert.uf || "",
        nivel: alert.nivel || "",
        severity: classifyCivilDefenseLevel(alert.nivel),
        timestamp: alert.datahoracriacao ? new Date(alert.datahoracriacao.replace(" ", "T") + "Z").toISOString() : new Date().toISOString(),
        url: `https://painelalertas.cemaden.gov.br/`,
        source: "CEMADEN / Defesa Civil"
      };
    })
    .filter(Boolean);
}

export async function fetchCivilDefenseAlerts() {
  const now = Date.now();
  if (now < cooldownUntil) return [];
  if (now - lastFetch < CEMADEN_POLL_MS && lastFetch > 0) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(CEMADEN_API, {
      signal: controller.signal,
      headers: { "User-Agent": "GlobalAlertDashboard/1.1 github.com/saimonsp/global-alert-dashboard" }
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`CEMADEN HTTP ${response.status}`);
    const data = await response.json();
    const alerts = normalizeCivilDefenseAlerts(data);
    lastFetch = now;
    return alerts;
  } catch (error) {
    cooldownUntil = now + COOLDOWN_MS;
    console.warn("CEMADEN indisponivel:", error.message);
    return [];
  }
}

export function shouldPollCivilDefense() {
  return Date.now() - lastFetch >= CEMADEN_POLL_MS;
}
