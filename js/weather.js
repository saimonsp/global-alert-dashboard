import { isValidCoordinate } from "./utils.js";
import { fetchJsonRetry } from "./http.js";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_SIZE = 100;
const cache = new Map();

export function weatherCodeToDescription(code) {
  const descriptions = {
    0: "Ceu limpo",
    1: "Principalmente limpo",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Nevoeiro",
    48: "Nevoeiro com deposito de gelo",
    51: "Garoa fraca",
    53: "Garoa moderada",
    55: "Garoa intensa",
    56: "Garoa congelante fraca",
    57: "Garoa congelante intensa",
    61: "Chuva fraca",
    63: "Chuva moderada",
    65: "Chuva forte",
    66: "Chuva congelante fraca",
    67: "Chuva congelante forte",
    71: "Neve fraca",
    73: "Neve moderada",
    75: "Neve forte",
    77: "Graos de neve",
    80: "Pancadas de chuva fracas",
    81: "Pancadas de chuva moderadas",
    82: "Pancadas de chuva violentas",
    85: "Pancadas de neve fracas",
    86: "Pancadas de neve fortes",
    95: "Trovoada",
    96: "Trovoada com granizo fraco",
    99: "Trovoada com granizo forte"
  };
  return descriptions[Number(code)] || "Condicao indisponivel";
}

export async function getWeather(latitude, longitude) {
  if (!isValidCoordinate(latitude, longitude)) throw new Error("Coordenadas invalidas");
  const key = `${Number(latitude).toFixed(2)},${Number(longitude).toFixed(2)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.data;

  const params = new URLSearchParams({
    latitude,
    longitude,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,weather_code",
    timezone: "auto"
  });
  const json = await fetchJsonRetry(`https://api.open-meteo.com/v1/forecast?${params}`, { timeoutMs: 10000, retries: 1 });
  const current = json?.current;
  if (!current) throw new Error("Open-Meteo sem dados atuais");

  const data = {
    temperature: current.temperature_2m ?? null,
    apparentTemperature: current.apparent_temperature ?? null,
    humidity: current.relative_humidity_2m ?? null,
    windSpeed: current.wind_speed_10m ?? null,
    windGusts: current.wind_gusts_10m ?? null,
    windDirection: current.wind_direction_10m ?? null,
    pressure: current.surface_pressure ?? null,
    weatherCode: current.weather_code ?? null,
    description: weatherCodeToDescription(current.weather_code),
    observedAt: current.time || null
  };
  cache.set(key, { savedAt: Date.now(), data });
  if (cache.size > CACHE_MAX_SIZE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  return data;
}
