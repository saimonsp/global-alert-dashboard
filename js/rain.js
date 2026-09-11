import { isFiniteNumber, isValidCoordinate, parseNumber } from "./utils.js";
import { fetchJsonRetry, fetchMetNorway, OPEN_METEO_URL, INMET_URL, MET_NORWAY_URL } from "./http.js";
import { WORLD_WIND_CITIES, WIND_THRESHOLD_KMH, buildRegionalWindEvents } from "./winds.js";
import { weatherCodeToDescription } from "./weather.js";

export const RAIN_THRESHOLD_MM = 0.1;
const OPEN_METEO_CURRENT_VARS =
  "wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,rain,weather_code," +
  "temperature_2m,apparent_temperature,relative_humidity_2m";
const OPEN_METEO_HOURLY_VARS = "precipitation,rain,weather_code";
const HISTORY_HOURS = 72;

export const WORLD_WEATHER_POINTS = WORLD_WIND_CITIES.map(([latitude, longitude, name, country]) => ({
  latitude,
  longitude,
  name,
  country
}));

export async function fetchRainfall(points) {
  const valid = (points || []).filter(point => isValidCoordinate(point.latitude, point.longitude));
  if (!valid.length) return [];
  const lats = valid.map(point => point.latitude.toFixed(4));
  const lons = valid.map(point => point.longitude.toFixed(4));
  const url = `${OPEN_METEO_URL}?latitude=${lats.join(",")}&longitude=${lons.join(",")}` +
    "&current=precipitation,rain,weather_code&forecast_days=1";
  const data = await fetchJsonRetry(url, { timeoutMs: 20000 });
  const list = Array.isArray(data) ? data : [data];
  const observedAt = new Date().toISOString();
  const rains = [];
  list.forEach((item, index) => {
    const point = valid[index];
    const current = item?.current ?? {};
    const precipitation = parseNumber(current.precipitation);
    if (precipitation === null || precipitation < RAIN_THRESHOLD_MM) return;
    const code = parseNumber(current.weather_code);
    rains.push({
      id: `rain-${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`,
      type: "rain",
      scope: "base",
      latitude: point.latitude,
      longitude: point.longitude,
      precipitation,
      description: code !== null && code !== undefined ? weatherCodeToDescription(code) : null,
      place: point.name || `${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)}`,
      timestamp: observedAt,
      url: "",
      source: "Open-Meteo"
    });
  });
  return rains;
}

function buildRegionalRainEvents(rains, scope) {
  const observedAt = new Date().toISOString();
  return rains.map(point => ({
    id: `rain-${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`,
    type: "rain",
    scope,
    latitude: point.latitude,
    longitude: point.longitude,
    precipitation: point.precipitation,
    description: point.description ?? null,
    place: point.name || `${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)}`,
    timestamp: point.timestamp || observedAt,
    url: "",
    source: point.source
  }));
}

export async function fetchWindAndRain(points) {
  const valid = (points || []).filter(point => isValidCoordinate(point.latitude, point.longitude));
  if (!valid.length) return { winds: [], rains: [], observations: [] };
  try {
    return await fetchWindAndRainOpenMeteo(valid);
  } catch (error) {
    if (error?.status === 429 || error?.name === "AbortError" || !error?.status) {
      console.warn("Open-Meteo indisponivel, tentando MET Norway...", error.message);
      return await fetchWindAndRainMetNorway(valid);
    }
    throw error;
  }
}

async function fetchWindAndRainOpenMeteo(valid) {
  const lats = valid.map(point => point.latitude.toFixed(4));
  const lons = valid.map(point => point.longitude.toFixed(4));
  const url = `${OPEN_METEO_URL}?latitude=${lats.join(",")}&longitude=${lons.join(",")}` +
    `&current=${OPEN_METEO_CURRENT_VARS}&hourly=${OPEN_METEO_HOURLY_VARS}&past_hours=${HISTORY_HOURS}&wind_speed_unit=kmh&forecast_days=1`;
  const data = await fetchJsonRetry(url, { timeoutMs: 20000 });
  const list = Array.isArray(data) ? data : [data];
  return normalizeOpenMeteoBatch(list, valid, "Open-Meteo");
}

async function fetchWindAndRainMetNorway(valid) {
  const observedAt = new Date().toISOString();
  const winds = [];
  const rains = [];
  const observations = [];
  const fetches = valid.map(async (point) => {
    const url = `${MET_NORWAY_URL}?lat=${point.latitude}&lon=${point.longitude}`;
    const data = await fetchMetNorway(url);
    const timeseries = data?.properties?.timeseries ?? [];
    const current = timeseries[0];
    if (!current) return;
    const details = current?.data?.instant?.details ?? {};
    const temperature = parseNumber(details.air_temperature);
    const humidity = parseNumber(details.relative_humidity);
    const windSpeed = parseNumber(details.wind_speed);
    const windDirection = parseNumber(details.wind_from_direction);
    const windGusts = parseNumber(details.wind_speed_of_gust);
    const next1h = current?.data?.next_1_hours ?? current?.data?.next_6_hours ?? {};
    const precipitation = parseNumber(next1h?.details?.precipitation_amount);
    const symbolCode = next1h?.summary?.symbol_code ?? "";
    const weatherCode = metNorwaySymbolToCode(symbolCode);
    observations.push({
      latitude: point.latitude,
      longitude: point.longitude,
      name: point.name,
      country: point.country ?? "",
      temperature,
      apparentTemperature: temperature,
      humidity,
      windGusts,
      precipitation,
      precipitationHistory: []
    });
    if (windSpeed !== null && windSpeed * 3.6 >= WIND_THRESHOLD_KMH) {
      winds.push({
        latitude: point.latitude,
        longitude: point.longitude,
        windSpeed: windSpeed * 3.6,
        windGusts: windGusts !== null ? windGusts * 3.6 : null,
        windDirection,
        name: point.name || `${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)}`,
        source: "MET Norway",
        timestamp: observedAt
      });
    }
    if (precipitation !== null && precipitation >= RAIN_THRESHOLD_MM) {
      rains.push({
        latitude: point.latitude,
        longitude: point.longitude,
        precipitation,
        description: weatherCode !== null ? weatherCodeToDescription(weatherCode) : null,
        name: point.name || `${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)}`,
        source: "MET Norway",
        timestamp: observedAt
      });
    }
  });
  await Promise.allSettled(fetches);
  return {
    winds: buildRegionalWindEvents(winds, "base"),
    rains: buildRegionalRainEvents(rains, "base"),
    observations
  };
}

function metNorwaySymbolToCode(symbol) {
  const map = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3,
    lightrainshowers: 51, lightrainshowersandthunder: 61,
    rainshowers: 63, heavyrainshowers: 65,
    lightrain: 51, rain: 63, heavyrain: 65,
    lightsnow: 71, snow: 73, heavysnow: 75,
    lightsleet: 66, sleet: 67, heavysleet: 68,
    lightrainandthunder: 95, rainandthunder: 96, heavyrainandthunder: 99,
    fog: 45
  };
  const base = symbol?.replace(/_day|_night|_polartwilight/g, "") ?? "";
  return map[base] ?? null;
}

function normalizeOpenMeteoBatch(list, valid, source) {
  const observedAt = new Date().toISOString();
  const winds = [];
  const rains = [];
  const observations = [];
  list.forEach((item, index) => {
    const point = valid[index];
    const current = item?.current ?? {};
    const hourly = item?.hourly ?? {};
    const hourlyPrecip = hourly.precipitation ?? [];
    const hourlyTime = hourly.time ?? [];
    const precipitationHistory = hourlyPrecip.map((value, i) => ({
      time: hourlyTime[i] ? new Date(hourlyTime[i]).getTime() : Date.now() - (HISTORY_HOURS - i) * 3600000,
      value: parseNumber(value)
    })).filter(p => p.value !== null);
    const temperature = parseNumber(current.temperature_2m);
    const apparentTemperature = parseNumber(current.apparent_temperature);
    const humidity = parseNumber(current.relative_humidity_2m);
    const windGusts = parseNumber(current.wind_gusts_10m);
    const precipitation = parseNumber(current.precipitation);
    observations.push({
      latitude: point.latitude,
      longitude: point.longitude,
      name: point.name,
      country: point.country ?? "",
      temperature,
      apparentTemperature,
      humidity,
      windGusts,
      precipitation,
      precipitationHistory
    });
    const speed = parseNumber(current.wind_speed_10m);
    if (speed !== null && speed >= WIND_THRESHOLD_KMH) {
      winds.push({
        latitude: point.latitude,
        longitude: point.longitude,
        windSpeed: speed,
        windGusts,
        windDirection: parseNumber(current.wind_direction_10m),
        name: point.name || `${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)}`,
        source,
        timestamp: observedAt
      });
    }
    if (precipitation !== null && precipitation >= RAIN_THRESHOLD_MM) {
      const code = parseNumber(current.weather_code);
      rains.push({
        latitude: point.latitude,
        longitude: point.longitude,
        precipitation,
        description: code !== null && code !== undefined ? weatherCodeToDescription(code) : null,
        name: point.name || `${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)}`,
        source,
        timestamp: observedAt
      });
    }
  });
  return {
    winds: buildRegionalWindEvents(winds, "base"),
    rains: buildRegionalRainEvents(rains, "base"),
    observations
  };
}

function pickExtreme(observations, key, mode) {
  let selected = null;
  observations.forEach(observation => {
    const value = observation[key];
    if (value === null || value === undefined) return;
    if (!selected || (mode === "max" ? value > selected[key] : value < selected[key])) {
      selected = observation;
    }
  });
  return selected;
}

export function buildClimateExtremes(observations) {
  const valid = (observations || []).filter(observation =>
    isValidCoordinate(observation.latitude, observation.longitude)
  );
  if (!valid.length) return null;
  const hottest = pickExtreme(valid, "apparentTemperature", "max");
  const coldest = pickExtreme(valid, "temperature", "min");
  return {
    hottest: hottest ?? pickExtreme(valid, "temperature", "max"),
    coldest,
    strongestGust: pickExtreme(valid, "windGusts", "max"),
    heaviestRain: pickExtreme(valid, "precipitation", "max")
  };
}

export async function fetchInmetWindAndRain() {
  const now = new Date();
  const date = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0")
  ].join("-");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const data = await fetchJsonRetry(`${INMET_URL}${date}/${hour}`, { timeoutMs: 20000 });
  if (!Array.isArray(data)) return { winds: [], rains: [] };
  const winds = [];
  const rains = [];
  data.forEach(station => {
    const latitude = parseNumber(station.VL_LATITUDE);
    const longitude = parseNumber(station.VL_LONGITUDE);
    if (!isValidCoordinate(latitude, longitude)) return;
    const speed = parseNumber(station.vento_vel);
    const gust = parseNumber(station.vento_raj);
    const direction = parseNumber(station.vento_dir);
    const precipitation = parseNumber(station.CHUVA);
    if (speed === null && precipitation === null) return;
    const name = station.DC_NOME || `Estacao ${station.CD_ESTACAO || ""}`.trim();
    const uf = station.UF || "";
    const timestampRaw = `${station.DT_MEDICAO || date}T${station.HR_MEDICAO || hour}:00:00Z`;
    const parsedTimestamp = new Date(timestampRaw).getTime();
    const timestamp = Number.isNaN(parsedTimestamp) ? new Date().toISOString() : new Date(timestampRaw).toISOString();
    const label = uf ? `${name} - ${uf}` : name;
    if (speed !== null) {
      const speedKmh = speed * 3.6;
      if (speedKmh >= WIND_THRESHOLD_KMH) {
        winds.push({
          latitude,
          longitude,
          windSpeed: speedKmh,
          windGusts: gust === null ? null : gust * 3.6,
          windDirection: direction,
          name: label,
          source: "INMET",
          timestamp
        });
      }
    }
    if (precipitation !== null && precipitation >= RAIN_THRESHOLD_MM) {
      rains.push({
        latitude,
        longitude,
        precipitation,
        description: null,
        name: label,
        source: "INMET",
        timestamp
      });
    }
  });
  return {
    winds: buildRegionalWindEvents(winds, "regional"),
    rains: buildRegionalRainEvents(rains, "regional")
  };
}

export function mergeRegionalRain(baseRain, regionalRain) {
  const base = baseRain.filter(rain => rain.scope !== "regional");
  return [...base, ...regionalRain];
}