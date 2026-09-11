# MEMORY.md - Memoria do Projeto

## Historico de Requisitos

### Solicitacao Inicial
- Dashboard web para monitorar eventos naturais globais
- Usar APIs publicas (USGS, EONET, Open-Meteo, INMET, NOAA, ANA, Nominatim)
- Mapa-mundi interativo com Leaflet
- Modo TV para exibicao passiva
- Tema escuro, layout responsivo
- Sem framework, vanilla JS com modulos ES

### Funcionalidades Implementadas
1. **Terremotos**: USGS com fallback EMSC, classificacao por magnitude/profundidade
2. **Tempestades**: NASA EONET com fallback GDACS, deduplicacao
3. **Ventos fortes**: Open-Meteo/INMET, limiar 50 km/h, grade regional
4. **Chuvas**: Open-Meteo/INMET, historico 72h, extremos climaticos
5. **Enchentes**: Risco por precipitacao acumulada (ANA/HidroWeb)
6. **Queimadas**: INPE (focos via CSV)
7. **Vulcoes**: USGS VHP (alert levels)
8. **Solar**: NOAA SWPC (raios-X + indice Kp)
9. **Modo TV**: Rotacao, relogio, ticker, burn-in, watchdog
10. **Fontes offline**: RTL-SDR, GOES, Meshtastic, HF (WebSocket)
11. **Configuracoes**: Tema, cor, fonte, mapa, fontes de dados, notificacoes

### Regras de Negocio
- Fator de seguranca de 75% na quota diaria do Open-Meteo (10.000 chamadas)
- Polling adaptativo baseado na quota disponivel
- Cooldown de 5 min para INMET em caso de falha
- Cooldown de 15 min para Open-Meteo em caso de 429
- Cache de Open-Meteo: TTL 10 min, max 100 entradas
- Cache de Nominatim: TTL 30 min, max 80 entradas
- Debounce 650ms para busca de localidades
- Auto-retry com backoff exponencial

## Decisoes Tecnicas

### Arquitetura
- **Modulos ES**: import/export direto, sem bundler
- **Separacao de responsabilidades**: api.js (fetch), http.js (cliente), [dominio].js (normalizacao), map.js (renderizacao), ui.js (DOM), app.js (estado)
- **Fluxo de dados**: app.js (estado) -> map.js/ui.js/tv.js (renderizacao)
- **Sem dependencias circulares**: map.js importa de ui.js, nao o inverso

### Seguranca (AppSec)
- `escapeHtml()` obrigatorio para todo conteudo dinamico no DOM
- `safeExternalUrl()` para links externos em popups
- Sem `eval()`, sem `innerHTML` com conteudo nao sanitizado
- Sem chaves de API hardcoded (todas as APIs sao publicas)
- CSP: sem scripts inline (exceto modulos ES)

### Performance
- `DocumentFragment` para renderizacao em lote
- Invalidacao de tamanho do mapa com debounce (150ms)
- Cache em memoria com TTL para APIs
- Polling adaptativo baseado em quota

## Bugs Corrigidos

### 2026-09-08
1. **map.js**: `isValidCoordinate` usado mas nao importado de `utils.js` - causava ReferenceError no botao de localizacao
2. **offline-sources.js**: Variavel `aheadline` indefinida (deveria ser `a.headline`) - causava ReferenceError ao processar alertas NWR

### 2026-09-11
3. **earthquakes.js**: `Number(depth) ?? 100` nao captura NaN - profundidade null era tratada como 0km em vez de 100km
4. **utils.js**: Typo "Alundo" corrigido para "Alto" no risco de terremoto
5. **index.html**: Typo `--:--:` no elemento de vulcoes corrigido para `--:--:--`
6. **Painel de clima local**: Adicionado botao de fechar (X) - antes nao tinha como fechar
7. **Banner de erro**: Adicionado botao de dispensar (X) ao lado de "Retentar"

## Configuracoes Removidas (eram salvas mas nunca funcionavam)

Removidas em 2026-09-11:
- `setting-cluster` - clustering nunca implementado
- `setting-critical-only` - nunca filtrava alertas
- `setting-auto-refresh` - polling sempre rodava
- `setting-refresh-interval` - intervalos hardcoded no app.js
- `setting-tv-rotation` - intervalo fixo de 25s no tv.js
- `setting-tv-burnin` - burn-in sempre executava

## Codigo Morto Removido

Removido em 2026-09-11:
- `fetchRainfall()` de rain.js (substituida por fetchWindAndRain)
- `clearAlertSystem()` de alerts.js (nunca chamada)
- `elements.strongCount` de ui.js (elemento HTML inexistente)

## Melhorias de UI

Aplicadas em 2026-09-11:
- `border-radius` em todos os paineis: stat-cards, map-panel, alerts, local-weather, search-box, critical-banner, settings-groups, online-pill, status-bar
- Banner de erro com texto alinhado a esquerda

## APIs Utilizadas

| API | Endpoint | Limite | Fallback |
|-----|----------|--------|----------|
| USGS Earthquake | earthquake.usgs.gov | Sem limite | EMSC SeismicPortal |
| NASA EONET | eonet.gsfc.nasa.gov | Sem limite | GDACS |
| Open-Meteo | api.open-meteo.com | 10.000/dia | MET Norway -> weather-api.site |
| INMET | apitempo.inmet.gov.br | Sem limite | Open-Meteo |
| NOAA SWPC | services.swpc.noaa.gov | Sem limite | - |
| ANA HidroWeb | ana.gov.br | Sem limite | - |
| INPE Queimadas | dataserver-coids.inpe.br | Sem limite | - |
| USGS VHP | volcanoes.usgs.gov | Sem limite | - |
| Nominatim | nominatim.openstreetmap.org | 1 req/s | - |

## Estrutura de Pastas

```
global-alert-dashboard/
  index.html          - Interface principal
  offline-survival.html - Manual de sobrevivencia offline
  tests.html          - Testes unitarios no navegador
  css/style.css       - Estilos (tema escuro, responsivo)
  js/
    app.js            - Estado global, polling, ciclo de vida
    api.js            - Fetch com fallback
    http.js           - Cliente HTTP compartilhado
    earthquakes.js    - Normalizacao USGS/EMSC
    storms.js         - Normalizacao EONET/GDACS
    winds.js          - Normalizacao de vento
    rain.js           - Normalizacao de chuva
    floods.js         - Monitoramento de enchentes
    solar.js          - Atividade solar NOAA
    weather.js        - Consulta Open-Meteo
    geocoding.js      - Nominatim
    map.js            - Leaflet, marcadores, popups
    ui.js             - Elementos DOM, renderizacao
    tv.js             - Modo TV
    alerts.js         - Sistema de alertas regionais
    fires.js          - Queimadas INPE
    volcanoes.js      - Vulcoes USGS
    settings.js       - Configuracoes persistentes
    offline-sources.js - Fontes offline (WebSocket)
    quota.js          - Controle de quota
    utils.js          - Funcoes puras
  docs/               - Documentacao
  .github/workflows/  - CI/CD
```

## Gitflow

- `main` -> producao estavel
- `develop` -> desenvolvimento
- `feature/*` -> novas funcionalidades
- `fix/*` -> correcoes de bugs
- `hotfix/*` -> correcoes urgentes em producao

## Comandos Uteis

```bash
# Iniciar servidor local
python3 -m http.server 8080

# Abrir dashboard
http://localhost:8080

# Abrir modo TV
http://localhost:8080/?tv=1

# Executar testes
# Abrir tests.html no navegador

# Verificar sintaxe JS
node --check js/*.js
```
