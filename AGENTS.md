# AGENTS.md - Convenções do Projeto

## Visão geral

Este é um dashboard web vanilla (sem framework) que monitora eventos naturais globais usando APIs públicas. O projeto usa módulos ES (`import`/`export`), Leaflet para mapas, e CSS customizado com tema escuro.

## Arquitetura de módulos

```
app.js          → Estado global, polling, ciclo de vida
map.js          → Leaflet, marcadores, popups, layers
ui.js           → Elementos DOM, renderização de painéis
api.js          → Fetch com fallback (USGS→EMSC, EONET→GDACS)
http.js         → Cliente HTTP compartilhado (fetchJsonRetry)
utils.js        → Funções puras sem dependência DOM
quota.js        → Controle de quota por API
winds.js        → Normalização de vento + grade regional
rain.js         → Normalização de chuva + extremos climáticos
floods.js       → Monitoramento de enchentes (ANA + risco)
solar.js        → Atividade solar NOAA (Kp + rajadas X)
weather.js      → Consulta Open-Meteo por coordenada
geocoding.js    → Nominatim (reverse + search)
tv.js           → Modo TV (rotação, burn-in, watchdog)
```

## Convenções de código

### JavaScript
- **Módulos ES**: usar `import`/`export` (não CommonJS)
- **Sem framework**: vanilla JS, DOM API direta
- **Async/await** para operações assíncronas
- **Template literals** para construção de HTML dinâmico
- **Optional chaining** (`?.`) e **nullish coalescing** (`??`) quando apropriado
- **`escapeHtml()`** obrigatório para qualquer conteúdo inserido no DOM via innerHTML
- **`DocumentFragment`** para renderização em lote de listas
- **Nomes em português** para labels, mensagens e variáveis de UI
- **Nomes em inglês** para funções, variáveis de lógica e nomes de arquivo
- Sem comentários no código (a menos que solicitado)

### CSS
- Variáveis CSS para cores (`--accent`, `--danger`, `--warning`, etc.)
- Tema escuro como padrão
- Layout responsivo com `clamp()` para tipografia
- Modo TV com classe `.tv-mode` no `<html>`

### APIs externas
- Sempre usar `fetchJsonRetry()` de `http.js` para chamadas HTTP
- Respeitar rate limits: debounce 650ms para Nominatim
- Cooldown de 5 min para INMET em caso de falha
- Cooldown de 15 min para Open-Meteo em caso de 429
- Fator de segurança de 75% na quota diária do Open-Meteo

### Tratamento de erros
- Usar `Promise.allSettled()` para chamadas paralelas
- `try/catch` em todas as operações de rede
- Status de cada API visível no painel de fontes
- Auto-retry com backoff exponencial para fontes com falha

## Conexões entre módulos

### Circular dependencies
- `map.js` → `ui.js` (importa `setApiStatus`, `elements`, `refreshIcons`)
- `ui.js` não importa de `map.js`
- **Não criar dependências circulares** entre módulos

### Fluxo de dados
```
app.js (estado) → map.js (renderiza mapa)
                → ui.js  (renderiza painéis)
                → tv.js  (sincroniza modo TV)
```

### Dados de enchentes
```
rain.js (observações com precipitationHistory)
  → floods.js (fetchAnaStations + buildFloodRiskFromRain)
    → app.js (state.floods)
      → map.js (addFlood)
      → ui.js  (renderStats, renderAlerts)
      → tv.js  (labelFor, symbolFor)
```

## Formato de eventos

Todos os eventos normalizados devem ter:
```js
{
  id: string,           // ID único (com prefixo de fonte se necessário)
  type: string,         // "earthquake" | "storm" | "wind" | "rain" | "river_flood" | "flood_risk"
  latitude: number,
  longitude: number,
  timestamp: string,    // ISO 8601
  source: string,       // Nome da fonte (ex: "USGS", "Open-Meteo")
  // + campos específicos do tipo
}
```

## Performance

- Cache de Open-Meteo com TTL de 10 min e limite de 100 entradas
- Cache de Nominatim com TTL de 30 min e limite de 80 entradas
- Invalidação de tamanho do mapa com debounce (150ms)
- Polling: terremotos 60s, tempestades 15min, tempo ~15-30min (calculado), solar 30min
- `DocumentFragment` para listas grandes (alertas: máx 60, boletim: máx 40)

## Segurança

- Nunca logar chaves de API ou secrets
- `escapeHtml()` sempre que inserir conteúdo dinâmico no DOM
- `safeExternalUrl()` para links externos em popups
- Sem `eval()`, sem `innerHTML` com conteúdo não sanitizado
- CSP: sem scripts inline (exceto módulos ES)

## Testes

- Arquivo `tests.html` com testes unitários no navegador
- Usar framework de testes mínimo (funções `test()` e `assert()` inline)
- Testar: normalização de dados, funções utilitárias, classificações
- Abrir `tests.html` no navegador para executar

## Formatação

- 2 espaços de indentação
- Ponto e vírgula em todas as instruções
- Strings com aspas duplas
- Template literals para strings compostas
- Sem trailing commas
