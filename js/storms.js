import { isFiniteNumber, isValidCoordinate } from "./utils.js";

export const EONET_STORM_ENDPOINT = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson?category=severeStorms&days=30&status=all&limit=80";
export const GDACS_TC_ENDPOINT = "https://www.gdacs.org/xml/gdacsTC.geojson";

function classifyStormSeverity(alertLevel, magnitudeValue) {
  const level = String(alertLevel || "").toLowerCase();
  const mag = Number(magnitudeValue) || 0;
  if (level === "red" || level === "orange" || mag >= 4) return "severe";
  if (level === "yellow" || mag >= 3) return "moderate";
  return "normal";
}

function pointFromGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    const [longitude, latitude] = geometry.coordinates ?? [];
    return isValidCoordinate(latitude, longitude) ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
  }
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates) && geometry.coordinates.length) {
    const [longitude, latitude] = geometry.coordinates[geometry.coordinates.length - 1] ?? [];
    return isValidCoordinate(latitude, longitude) ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
  }
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates?.[0]) && geometry.coordinates[0].length) {
    const points = geometry.coordinates[0].filter(([lon, lat]) => isValidCoordinate(lat, lon));
    if (!points.length) return null;
    const totals = points.reduce((acc, [lon, lat]) => ({ lon: acc.lon + Number(lon), lat: acc.lat + Number(lat) }), { lon: 0, lat: 0 });
    return { latitude: totals.lat / points.length, longitude: totals.lon / points.length };
  }
  return null;
}

export function normalizeStormData(data) {
  if (!data || !Array.isArray(data.features)) return [];
  const latestById = new Map();

  data.features.forEach(feature => {
    const props = feature?.properties ?? {};
    const id = props.id || feature?.id;
    const point = pointFromGeometry(feature?.geometry);
    const timestamp = props.date ? new Date(props.date).toISOString() : null;
    if (!id || !point || !timestamp) return;

    const categories = Array.isArray(props.categories) ? props.categories : [];
    const severeCategory = categories.find(category => {
      const text = `${category?.id ?? ""} ${category?.title ?? ""}`.toLowerCase();
      return text.includes("storm") || text.includes("cyclone") || text.includes("hurricane");
    }) || categories[0];

    const sourceUrl = Array.isArray(props.sources) && props.sources[0]?.url ? props.sources[0].url : props.link;
    const event = {
      id: String(id),
      type: "storm",
      latitude: point.latitude,
      longitude: point.longitude,
      title: props.title || "Tempestade sem nome",
      category: severeCategory?.title || severeCategory?.id || "Severe Storms",
      timestamp,
      url: sourceUrl || props.link || "",
      source: "NASA EONET",
      magnitudeValue: isFiniteNumber(props.magnitudeValue) ? Number(props.magnitudeValue) : null,
      magnitudeUnit: props.magnitudeUnit || ""
    };

    const current = latestById.get(event.id);
    if (!current || new Date(event.timestamp) > new Date(current.timestamp)) {
      latestById.set(event.id, event);
    }
  });

  return [...latestById.values()];
}

export function normalizeGdacsStormData(data) {
  if (!data || !Array.isArray(data.features)) return [];
  const latestById = new Map();

  data.features.forEach(feature => {
    const props = feature?.properties ?? {};
    const id = props.eventid && props.episodeid ? `${props.eventid}-${props.episodeid}` : props.eventid;
    const longitude = Number(props.longitude);
    const latitude = Number(props.latitude);
    const timestampRaw = props.todate || props.fromdate;
    const time = timestampRaw ? new Date(timestampRaw).getTime() : NaN;
    const timestamp = Number.isFinite(time) ? new Date(time).toISOString() : null;
    if (!id || !isValidCoordinate(latitude, longitude) || !timestamp) return;

    const alertLevel = props.alertlevel ? `Alerta ${props.alertlevel}` : "";
    const severity = classifyStormSeverity(props.alertlevel, props.severity);
    const event = {
      id: `gdacs-${String(id)}`,
      type: "storm",
      latitude,
      longitude,
      title: props.eventname || props.name || "Ciclone sem nome",
      category: ["Tropical Cyclone", alertLevel].filter(Boolean).join(" · "),
      severity,
      timestamp,
      url: props.link || "",
      source: "GDACS",
      magnitudeValue: isFiniteNumber(props.severity) ? Number(props.severity) : null,
      magnitudeUnit: ""
    };

    const current = latestById.get(event.id);
    if (!current || new Date(event.timestamp) > new Date(current.timestamp)) {
      latestById.set(event.id, event);
    }
  });

  return [...latestById.values()];
}
