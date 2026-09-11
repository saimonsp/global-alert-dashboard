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
  NOAA_NHC_ENDPOINT,
  POCKETWORLD_STORMS_ENDPOINT,
  normalizeStormData,
  normalizeGdacsStormData,
  normalizeNhcStormData,
  normalizePocketWorldStormData
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
    console.warn("NASA EONET indisponivel, tentando NOAA NHC...", error.message);
    try {
      const data = await fetchJsonRetry(NOAA_NHC_ENDPOINT);
      return { events: normalizeNhcStormData(data), source: "NOAA NHC" };
    } catch (nhcError) {
      console.warn("NOAA NHC indisponivel, tentando GDACS...", nhcError.message);
      try {
        const data = await fetchJsonRetry(GDACS_TC_ENDPOINT);
        return { events: normalizeGdacsStormData(data), source: "GDACS" };
      } catch (gdacsError) {
        console.warn("GDACS indisponivel, tentando PocketWorld...", gdacsError.message);
        const data = await fetchJsonRetry(POCKETWORLD_STORMS_ENDPOINT);
        return { events: normalizePocketWorldStormData(data), source: "PocketWorld" };
      }
    }
  }
}

export async function fetchVolcanoes() {
  const data = await fetchJsonRetry(USGS_VOLCANO_URL);
  return { events: normalizeVolcanoData(data), source: "USGS VHP" };
}