import { isFiniteNumber, isValidCoordinate, parseNumber } from "./utils.js";
import { fetchJsonRetry, OPEN_METEO_URL, INMET_URL } from "./http.js";

export const WIND_THRESHOLD_KMH = 50;

export const WORLD_WIND_CITIES = [
  [-33.8688, 151.2093, "Sydney", "AU"],
  [-37.8136, 144.9631, "Melbourne", "AU"],
  [-36.8485, 174.7633, "Auckland", "NZ"],
  [41.9028, 12.4964, "Roma", "IT"],
  [40.4168, -3.7038, "Madri", "ES"],
  [38.7223, -9.1393, "Lisboa", "PT"],
  [48.8566, 2.3522, "Paris", "FR"],
  [51.5074, -0.1278, "Londres", "GB"],
  [52.52, 13.405, "Berlim", "DE"],
  [59.3293, 18.0686, "Estocolmo", "SE"],
  [41.0082, 28.9784, "Istambul", "TR"],
  [55.7558, 37.6173, "Moscou", "RU"],
  [39.9042, 116.4074, "Pequim", "CN"],
  [31.2304, 121.4737, "Xangai", "CN"],
  [22.3193, 114.1694, "Hong Kong", "CN"],
  [35.6762, 139.6503, "Toquio", "JP"],
  [37.5665, 126.978, "Seul", "KR"],
  [13.7563, 100.5018, "Bangkok", "TH"],
  [1.3521, 103.8198, "Singapura", "SG"],
  [-6.2088, 106.8456, "Jacarta", "ID"],
  [28.6139, 77.209, "Nova Delhi", "IN"],
  [19.076, 72.8777, "Mumbai", "IN"],
  [25.2048, 55.2708, "Dubai", "AE"],
  [30.0444, 31.2357, "Cairo", "EG"],
  [-1.2921, 36.8219, "Nairobi", "KE"],
  [33.9716, -6.8498, "Rabat", "MA"],
  [19.4326, -99.1332, "Cidade do Mexico", "MX"],
  [37.7749, -122.4194, "Sao Francisco", "US"],
  [34.0522, -118.2437, "Los Angeles", "US"],
  [40.7128, -74.006, "Nova York", "US"],
  [25.7617, -80.1918, "Miami", "US"],
  [43.6532, -79.3832, "Toronto", "CA"],
  [4.711, -74.0721, "Bogota", "CO"],
  [-12.0464, -77.0428, "Lima", "PE"],
  [-33.4489, -70.6693, "Santiago", "CL"],
  [-34.6037, -58.3816, "Buenos Aires", "AR"],
  [-15.7801, -47.9292, "Brasilia", "BR"],
  [-23.5505, -46.6333, "Sao Paulo", "BR"],
  [-22.9068, -43.1729, "Rio de Janeiro", "BR"],
  [-12.9777, -38.5016, "Salvador", "BR"],
  [-3.119, -60.0217, "Manaus", "BR"],
  [-8.0476, -34.877, "Recife", "BR"],
  [-25.4284, -49.2733, "Curitiba", "BR"],
  [-30.0346, -51.2177, "Porto Alegre", "BR"],
  [-3.7319, -38.5267, "Fortaleza", "BR"]
];

export function buildRegionalWindEvents(winds, scope) {
  const observedAt = new Date().toISOString();
  return winds.map(point => ({
    id: `wind-${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`,
    type: "wind",
    scope,
    latitude: point.latitude,
    longitude: point.longitude,
    windSpeed: point.windSpeed,
    windGusts: point.windGusts,
    windDirection: point.windDirection,
    place: point.name || `${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)}`,
    timestamp: observedAt,
    url: "",
    source: point.source
  }));
}

export function buildGridPoints(bounds, zoom) {
  const step = zoom >= 10 ? 0.5 : zoom >= 8 ? 1 : 2;
  const minLat = Math.max(-85, Math.floor(bounds.getSouth()));
  const maxLat = Math.min(85, Math.ceil(bounds.getNorth()));
  const minLon = Math.max(-180, Math.floor(bounds.getWest()));
  const maxLon = Math.min(180, Math.ceil(bounds.getEast()));
  const points = [];
  for (let lat = minLat; lat <= maxLat; lat += step) {
    for (let lon = minLon; lon <= maxLon; lon += step) {
      points.push({ latitude: lat + step / 2, longitude: lon + step / 2 });
    }
  }
  if (points.length > 40) {
    const sample = Math.ceil(points.length / 40);
    return points.filter((_, index) => index % sample === 0);
  }
  return points;
}

export function mergeRegionalWinds(baseWinds, regionalWinds) {
  const base = baseWinds.filter(wind => wind.scope !== "regional");
  return [...base, ...regionalWinds];
}