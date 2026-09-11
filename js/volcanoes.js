import { isValidCoordinate, isFiniteNumber } from "./utils.js";

const USGS_VOLCANO_URL = "https://volcanoes.usgs.gov/vhp/api/v2/geojson/volcanoes";

const ALERT_LEVELS = {
  "Watch": 4,
  "Warning": 5,
  "Advisory": 2,
  "Normal": 1
};

function classifyVolcanoEruption(level) {
  const norm = String(level || "").trim().toLowerCase();
  if (norm === "warning") return "warning";
  if (norm === "watch") return "watch";
  if (norm === "advisory") return "advisory";
  return "normal";
}

export function getVolcanoStyle(level) {
  const severity = classifyVolcanoEruption(level);
  const scale = () => (document.documentElement.classList.contains("tv-mode") ? 1.45 : 1);
  switch (severity) {
    case "warning": return { color: "#ff3b30", radius: 14 * scale(), level: severity };
    case "watch": return { color: "#ffbf47", radius: 12 * scale(), level: severity };
    case "advisory": return { color: "#ff9500", radius: 10 * scale(), level: severity };
    default: return { color: "#34c759", radius: 8 * scale(), level: severity };
  }
}

export function normalizeVolcanoData(data) {
  if (!data || !Array.isArray(data.features)) return [];
  const events = [];
  const seen = new Set();

  data.features.forEach(feature => {
    const props = feature?.properties ?? {};
    const geometry = feature?.geometry;
    if (!geometry || !Array.isArray(geometry.coordinates)) return;
    const [longitude, latitude] = geometry.coordinates;
    if (!isValidCoordinate(latitude, longitude)) return;

    const name = props.name || props.volcano_name || "Vulcao sem nome";
    const level = props.alert_level || props.alertlevel || "Normal";
    const alertColor = props.alert_color || "";
    const elevation = props.elevation;
    const type = props.type || props.volcano_type || "";
    const region = props.region || "";
    const country = props.country || "";
    const id = props.id || `volc-${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const dedupKey = `${name}-${level}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);

    events.push({
      id: String(id),
      type: "volcano",
      latitude: Number(latitude),
      longitude: Number(longitude),
      title: name,
      alertLevel: level,
      alertColor,
      severity: classifyVolcanoEruption(level),
      elevation: isFiniteNumber(elevation) ? Number(elevation) : null,
      volcanoType: type,
      region,
      country,
      timestamp: new Date().toISOString(),
      url: `https://volcanoes.usgs.gov/vhp/api/v2/volcanoes/${encodeURIComponent(name)}`,
      source: "USGS VHP"
    });
  });

  return events;
}

export { USGS_VOLCANO_URL };
