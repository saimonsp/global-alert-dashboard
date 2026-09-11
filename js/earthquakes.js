import { isFiniteNumber, isValidCoordinate } from "./utils.js";

export function getEarthquakeEndpoint(period) {
  if (period === "7d") return "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
  return "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";
}

export function getEmscEndpoint(period) {
  const hours = period === "6h" ? 6 : period === "7d" ? 24 * 7 : 24;
  const starttime = new Date(Date.now() - hours * 3600000).toISOString();
  return `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&starttime=${encodeURIComponent(starttime)}&minmagnitude=2.5`;
}

export function classifyDepth(depth) {
  const d = Number(depth);
  if (!isFiniteNumber(d)) return { label: "Desconhecida", zone: "unknown" };
  if (d <= 70) return { label: "Raso (0-70 km)", zone: "shallow", context: "Zona de falhas superficiais ou borda de placas" };
  if (d <= 300) return { label: "Intermediario (70-300 km)", zone: "intermediate", context: "Zona de subducao ativa" };
  if (d <= 700) return { label: "Profundo (300-700 km)", zone: "deep", context: "Placa subductada no manto superior" };
  return { label: "Muito profundo (700+ km)", zone: "very-deep", context: "Limite inferior da zona de Wadati-Benioff" };
}

export function tectonicContext(latitude, longitude, depth) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const d = Number(depth);
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return "";

  if (lat > 50 && lon > 150) return "Placa Pacifica / Placa Norte-Americana";
  if (lat > 30 && lat < 45 && lon > 125 && lon < 150) return "Placa Pacifica / Placa Filipina";
  if (lat > -10 && lat < 20 && lon > 90 && lon < 140) return "Zona de Sunda (subducao Indica-Australiana)";
  if (lat > -45 && lat < 0 && lon > 160 && lon < 180) return "Zona de subducao Pacifica-Australiana";
  if (lat > 15 && lat < 25 && lon > -110 && lon < -85) return "Rift do Golfo do Mexico / Placa de Coco";
  if (lat > -50 && lat < 10 && lon > -85 && lon < -65) return "Zona de subducao Nazca-Americana";
  if (lat > 35 && lat < 42 && lon > 20 && lon < 45) return "Zona de colisao Arabica-Eurasia";
  if (lat > -10 && lat < 10 && lon > 95 && lon < 140) return "Arco das Molucas / Zona de Banda";
  if (lat > 50 && lat < 70 && lon > -170 && lon < -130) return "Zona de subducao Alasca-Aleutiana";
  if (lat > 30 && lat < 40 && lon > -130 && lon < -115) return "Falha de San Andreas / Borda transformante";
  return "";
}

export function normalizeEarthquakeData(data) {
  if (!data || !Array.isArray(data.features)) return [];
  return data.features.map(feature => {
    const props = feature?.properties ?? {};
    const coords = feature?.geometry?.coordinates ?? [];
    const longitude = Number(coords[0]);
    const latitude = Number(coords[1]);
    const depth = isFiniteNumber(coords[2]) ? Number(coords[2]) : null;
    const magnitude = isFiniteNumber(props.mag) ? Number(props.mag) : null;
    const timestamp = props.time ? new Date(props.time).toISOString() : null;

    if (!feature?.id || !isValidCoordinate(latitude, longitude) || magnitude === null || !timestamp) {
      return null;
    }

    return {
      id: String(feature.id),
      type: "earthquake",
      latitude,
      longitude,
      magnitude,
      depth,
      depthInfo: classifyDepth(depth),
      tectonicContext: tectonicContext(latitude, longitude, depth),
      tsunami: Boolean(props.tsunami),
      significance: props.sig ?? null,
      magType: props.magType ?? "",
      riskLevel: classifyEarthquakeRisk(magnitude, depth),
      place: props.place || "Localizacao indisponivel",
      timestamp,
      url: props.url || "",
      source: "USGS"
    };
  }).filter(Boolean);
}

export function normalizeEmscData(data) {
  if (!data || !Array.isArray(data.features)) return [];
  return data.features.map(feature => {
    const props = feature?.properties ?? {};
    const coords = feature?.geometry?.coordinates ?? [];
    const longitude = Number(props.lon ?? coords[0]);
    const latitude = Number(props.lat ?? coords[1]);
    const depthValue = props.depth ?? coords[2];
    const depth = isFiniteNumber(depthValue) ? Number(depthValue) : null;
    const magnitude = isFiniteNumber(props.mag) ? Number(props.mag) : null;
    const time = props.time ? new Date(props.time).getTime() : NaN;
    const timestamp = Number.isFinite(time) ? new Date(time).toISOString() : null;

    if (!props.unid || !isValidCoordinate(latitude, longitude) || magnitude === null || !timestamp) {
      return null;
    }

    return {
      id: `emsc-${String(props.unid)}`,
      type: "earthquake",
      latitude,
      longitude,
      magnitude,
      depth,
      depthInfo: classifyDepth(depth),
      tectonicContext: tectonicContext(latitude, longitude, depth),
      tsunami: false,
      significance: null,
      magType: props.magType ?? "",
      riskLevel: classifyEarthquakeRisk(magnitude, depth),
      place: props.flynn_region || "Localizacao indisponivel",
      timestamp,
      url: "",
      source: "EMSC"
    };
  }).filter(Boolean);
}

export function getMagnitudeStyle(magnitude) {
  const mag = Number(magnitude);
  if (mag >= 6) return { level: "extreme", radius: 16, color: "#e60023", weight: 1 };
  if (mag >= 5) return { level: "very-high", radius: 13, color: "#ff3b30", weight: 0.8 };
  if (mag >= 4) return { level: "high", radius: 10, color: "#ff7043", weight: 0.62 };
  if (mag >= 3) return { level: "mid", radius: 8, color: "#ff8a65", weight: 0.45 };
  return { level: "low", radius: 6, color: "#ffb199", weight: 0.28 };
}

function classifyEarthquakeRisk(magnitude, depth) {
  const mag = Number(magnitude) || 0;
  const d = Number(depth) ?? 100;
  if (mag >= 7) return "extreme";
  if (mag >= 6) return "very-high";
  if (mag >= 5 && d < 70) return "high";
  if (mag >= 5) return "high";
  if (mag >= 4.5 && d < 30) return "moderate";
  if (mag >= 4) return "moderate";
  return "low";
}
