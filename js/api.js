import { fetchJsonRetry } from "./http.js";
import {
  getEarthquakeEndpoint,
  getEmscEndpoint,
  normalizeEarthquakeData,
  normalizeEmscData
} from "./earthquakes.js";
import {
  EONET_STORM_ENDPOINT,
  GDACS_TC_ENDPOINT,
  normalizeStormData,
  normalizeGdacsStormData
} from "./storms.js";
import { USGS_VOLCANO_URL, normalizeVolcanoData } from "./volcanoes.js";

export async function fetchEarthquakes(period = "24h") {
  try {
    const data = await fetchJsonRetry(getEarthquakeEndpoint(period));
    return { events: normalizeEarthquakeData(data), source: "USGS" };
  } catch (error) {
    console.warn("USGS indisponivel, usando EMSC como fallback", error);
    const data = await fetchJsonRetry(getEmscEndpoint(period));
    return { events: normalizeEmscData(data), source: "EMSC" };
  }
}

export async function fetchStorms() {
  try {
    const data = await fetchJsonRetry(EONET_STORM_ENDPOINT);
    return { events: normalizeStormData(data), source: "NASA EONET" };
  } catch (error) {
    console.warn("NASA EONET indisponivel, usando GDACS como fallback", error);
    const data = await fetchJsonRetry(GDACS_TC_ENDPOINT);
    return { events: normalizeGdacsStormData(data), source: "GDACS" };
  }
}

export async function fetchVolcanoes() {
  const data = await fetchJsonRetry(USGS_VOLCANO_URL);
  return { events: normalizeVolcanoData(data), source: "USGS VHP" };
}