const quota = {
  usgs: { calls: 0, limit: Infinity, label: "USGS" },
  eonet: { calls: 0, limit: Infinity, label: "NASA EONET" },
  weather: { calls: 0, limit: 10000, label: "Open-Meteo" },
  met_norway: { calls: 0, limit: Infinity, label: "MET Norway" },
  inmet: { calls: 0, limit: Infinity, label: "INMET" },
  solar: { calls: 0, limit: Infinity, label: "NOAA SWPC" },
  floods: { calls: 0, limit: Infinity, label: "Enchentes" },
  fires: { calls: 0, limit: Infinity, label: "INPE Queimadas" },
  volcanoes: { calls: 0, limit: Infinity, label: "USGS VHP" }
};

let lastQuotaResetDay = new Date().toDateString();

export function trackCall(source) {
  if (quota[source]) quota[source].calls++;
}

export function getQuotaInfo() {
  return Object.entries(quota).map(([key, q]) => ({
    source: key,
    label: q.label,
    calls: q.calls,
    limit: q.limit,
    pct: q.limit === Infinity ? null : Math.min(100, Math.round((q.calls / q.limit) * 100))
  }));
}

export function checkQuotaReset() {
  const today = new Date().toDateString();
  if (today !== lastQuotaResetDay) {
    Object.values(quota).forEach(q => { q.calls = 0; });
    lastQuotaResetDay = today;
  }
}
