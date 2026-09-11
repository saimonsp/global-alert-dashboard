const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const HEARTBEAT_MS = 30000;

const connections = {};

function generateId(prefix, seed) {
  return `offline-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normalizeNWR(data) {
  const events = [];
  const alerts = Array.isArray(data) ? data : data.alerts || data.events || [data];
  for (const a of alerts) {
    if (!a) continue;
    const ev = {
      id: a.id || generateId("nwr", a.event_id || a.code),
      type: "storm",
      title: a.title || a.headline || a.event || "Alerta NWR",
      description: a.description || a.message || "",
      severity: a.severity || a.urgency || "moderate",
      latitude: a.latitude ?? a.lat ?? null,
      longitude: a.longitude ?? a.lon ?? a.lng ?? null,
      timestamp: parseTimestamp(a.timestamp || a.received || a.date),
      source: "NWR (RTL-SDR)",
      offline: true,
      offlineType: "nwr_rtlsdr"
    };
    if (ev.latitude != null && ev.longitude != null) {
      events.push(ev);
    }
  }
  return events;
}

function normalizeGOES(data) {
  const events = [];
  const items = Array.isArray(data) ? data : data.alerts || data.events || [data];
  for (const item of items) {
    if (!item) continue;
    const ev = {
      id: item.id || generateId("goes", item.event_id),
      type: item.type || "storm",
      title: item.title || item.event || "Alerta GOES",
      description: item.description || item.summary || "",
      latitude: item.latitude ?? item.lat ?? null,
      longitude: item.longitude ?? item.lon ?? item.lng ?? null,
      timestamp: parseTimestamp(item.timestamp || item.detected),
      source: "GOES (Satelite)",
      offline: true,
      offlineType: "goes_satellite"
    };
    if (item.type === "fire" || item.hotspot) {
      ev.type = "fire";
      ev.latitude = item.latitude ?? item.lat;
      ev.longitude = item.longitude ?? item.lon;
      ev.brightness = item.brightness ?? item.bright_ti4;
      ev.satellite = "GOES";
    }
    if (ev.latitude != null && ev.longitude != null) {
      events.push(ev);
    }
  }
  return events;
}

function normalizeMeshtastic(data) {
  const events = [];
  const items = Array.isArray(data) ? data : data.messages || data.alerts || [data];
  for (const item of items) {
    if (!item) continue;
    const payload = item.payload || item;
    const ev = {
      id: item.id || generateId("mesh", item.from),
      type: payload.type || "alert",
      title: payload.title || payload.text || "Alerta Mesh",
      description: payload.description || payload.message || "",
      latitude: payload.latitude ?? payload.lat ?? item.position?.lat ?? null,
      longitude: payload.longitude ?? payload.lon ?? item.position?.lon ?? null,
      timestamp: parseTimestamp(item.timestamp || item.time),
      source: "Meshtastic (LoRa)",
      offline: true,
      offlineType: "meshtastic_lora"
    };
    if (ev.latitude != null && ev.longitude != null) {
      events.push(ev);
    }
  }
  return events;
}

function normalizeHF(data) {
  const events = [];
  const items = Array.isArray(data) ? data : data.alerts || data.reports || [data];
  for (const item of items) {
    if (!item) continue;
    const ev = {
      id: item.id || generateId("hf", item.freq),
      type: item.type || "alert",
      title: item.title || item.report || "Relato HF",
      description: item.description || item.text || "",
      frequency: item.frequency || item.freq || null,
      latitude: item.latitude ?? item.lat ?? null,
      longitude: item.longitude ?? item.lon ?? null,
      timestamp: parseTimestamp(item.timestamp || item.received),
      source: "HF (Ondas Curtas)",
      offline: true,
      offlineType: "hf_radio"
    };
    if (ev.latitude != null && ev.longitude != null) {
      events.push(ev);
    }
  }
  return events;
}

const NORMALIZERS = {
  nwr_rtlsdr: normalizeNWR,
  goes_satellite: normalizeGOES,
  meshtastic_lora: normalizeMeshtastic,
  hf_radio: normalizeHF
};

function createConnection(key, config, onEvents, onStatus) {
  if (connections[key]) {
    connections[key].close();
    delete connections[key];
  }

  const state = { ws: null, reconnectDelay: RECONNECT_BASE_MS, heartbeat: null, alive: false };

  function setStatus(status, detail) {
    onStatus(key, status, detail);
  }

  function connect() {
    if (!config.enabled || !config.endpoint) {
      setStatus("idle", "desativado");
      return;
    }

    try {
      setStatus("loading", "conectando...");
      const ws = new WebSocket(config.endpoint);
      state.ws = ws;

      ws.onopen = () => {
        state.reconnectDelay = RECONNECT_BASE_MS;
        state.alive = true;
        setStatus("online", "conectado");
        state.heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pong") return;
          const normalizer = NORMALIZERS[key];
          if (normalizer) {
            const events = normalizer(data);
            if (events.length) onEvents(key, events);
          }
        } catch (err) {
          console.warn(`[Offline:${key}] Erro ao processar mensagem:`, err);
        }
      };

      ws.onerror = () => {
        setStatus("error", "erro de conexao");
      };

      ws.onclose = () => {
        state.alive = false;
        clearInterval(state.heartbeat);
        if (config.enabled) {
          setStatus("error", "desconectado");
          scheduleReconnect();
        } else {
          setStatus("idle", "desativado");
        }
      };
    } catch (err) {
      setStatus("error", err.message);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (!config.enabled) return;
    setTimeout(() => {
      state.reconnectDelay = Math.min(state.reconnectDelay * 1.5, RECONNECT_MAX_MS);
      connect();
    }, state.reconnectDelay);
  }

  function close() {
    clearInterval(state.heartbeat);
    if (state.ws) {
      state.ws.onclose = null;
      state.ws.close();
      state.ws = null;
    }
    state.alive = false;
  }

  connect();

  return { close, reconnect: connect };
}

export function initOfflineSources(getSettings, onEvents, onStatus) {
  const offline = getSettings().offline;

  for (const [key, config] of Object.entries(offline)) {
    if (config.enabled) {
      connections[key] = createConnection(key, config, onEvents, onStatus);
    }
  }

  return {
    update(key, config) {
      if (config.enabled) {
        if (!connections[key]) {
          connections[key] = createConnection(key, config, onEvents, onStatus);
        }
      } else {
        if (connections[key]) {
          connections[key].close();
          delete connections[key];
        }
        onStatus(key, "idle", "desativado");
      }
    },
    disconnectAll() {
      for (const key of Object.keys(connections)) {
        connections[key].close();
        delete connections[key];
      }
    },
    isConnected(key) {
      return Boolean(connections[key]?.alive);
    }
  };
}
