export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
export const INMET_URL = "https://apitempo.inmet.gov.br/estacao/dados/";
export const MET_NORWAY_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";

const DEFAULT_OPTIONS = { timeoutMs: 15000, retries: 2, backoffMs: 800 };

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetry(error) {
  const status = error?.status;
  if (!status) return true;
  return status >= 500;
}

export async function fetchJsonRetry(url, options = {}) {
  const { timeoutMs, retries, backoffMs } = { ...DEFAULT_OPTIONS, ...options };
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const text = await response.text();
      if (!text || !text.trim()) {
        const error = new Error("Resposta vazia do servidor");
        error.status = response.status;
        throw error;
      }
      try {
        return JSON.parse(text);
      } catch {
        const error = new Error(`Resposta nao e JSON valida (HTTP ${response.status})`);
        error.status = response.status;
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === retries) break;
      await delay(backoffMs * 2 ** attempt + Math.random() * 300);
    }
  }
  throw lastError;
}

export async function fetchMetNorway(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "GlobalAlertDashboard/1.1 github.com/global-alert-dashboard" }
  });
  if (!response.ok) {
    const error = new Error(`MET Norway HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const text = await response.text();
  if (!text || !text.trim()) {
    throw new Error("MET Norway: resposta vazia");
  }
  return JSON.parse(text);
}