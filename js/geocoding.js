import { isValidCoordinate } from "./utils.js";
import { fetchJsonRetry } from "./http.js";

const CACHE_TTL_MS = 30 * 60 * 1000;
const SEARCH_MIN_CHARS = 3;
const SEARCH_CACHE_LIMIT = 80;
const cache = new Map();
const searchCache = new Map();

export function normalizeReverseGeocode(data, latitude, longitude) {
  const address = data?.address ?? {};
  const name = address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    data?.name ||
    data?.display_name;
  const region = [address.state || address.region, address.country].filter(Boolean).join(", ");

  return {
    name: name || `Local selecionado`,
    displayName: data?.display_name || `${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}`,
    region,
    source: "OpenStreetMap Nominatim"
  };
}

export function normalizeSearchResults(data) {
  return (Array.isArray(data) ? data : []).slice(0, 6).map(item => ({
    name: item.name || String(item.display_name ?? "").split(",")[0],
    displayName: item.display_name ?? "",
    latitude: Number.parseFloat(item.lat),
    longitude: Number.parseFloat(item.lon),
    boundingBox: Array.isArray(item.boundingbox)
      ? item.boundingbox.map(value => Number.parseFloat(value))
      : null,
    kind: [item.type, item.addresstype].filter(Boolean).join(" · ")
  })).filter(place => isValidCoordinate(place.latitude, place.longitude));
}

export async function searchPlaces(query) {
  const term = String(query ?? "").trim();
  if (term.length < SEARCH_MIN_CHARS) return [];
  const key = term.toLocaleLowerCase("pt-BR");
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.results;

  const params = new URLSearchParams({
    q: term,
    format: "jsonv2",
    limit: "6",
    "accept-language": "pt-BR"
  });
  const json = await fetchJsonRetry(`https://nominatim.openstreetmap.org/search?${params}`, {
    timeoutMs: 10000,
    retries: 0
  });
  const results = normalizeSearchResults(json);
  if (searchCache.size >= SEARCH_CACHE_LIMIT) {
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, { savedAt: Date.now(), results });
  return results;
}

export async function reverseGeocode(latitude, longitude) {
  if (!isValidCoordinate(latitude, longitude)) throw new Error("Coordenadas invalidas");
  const key = `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.data;

  const params = new URLSearchParams({
    format: "jsonv2",
    lat: latitude,
    lon: longitude,
    zoom: "10",
    addressdetails: "1",
    "accept-language": "pt-BR"
  });
  const json = await fetchJsonRetry(`https://nominatim.openstreetmap.org/reverse?${params}`, { timeoutMs: 10000, retries: 1 });
  const data = normalizeReverseGeocode(json, latitude, longitude);
  cache.set(key, { savedAt: Date.now(), data });
  return data;
}
