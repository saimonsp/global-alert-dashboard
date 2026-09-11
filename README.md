# Global Natural Events Dashboard

Dashboard web para monitorar e visualizar eventos naturais registrados por fontes publicas em um mapa-mundi interativo.

O projeto nao preve terremotos ou furacoes. Ele apenas apresenta dados publicados por fontes publicas e consulta condicoes meteorologicas atuais sob demanda.

## Instalacao

```bash
git clone ...
cd global-alert-dashboard
```

## Execucao

```bash
python3 -m http.server 8080
```

Abra:

```text
http://localhost:8080
```

Para o modo TV (exibicao passiva):

```text
http://localhost:8080/?tv=1
```

## APIs utilizadas

| API | Fonte | Uso | Limite |
|-----|-------|-----|--------|
| USGS Earthquake Hazards Program | `earthquake.usgs.gov` | Feeds GeoJSON de terremotos recentes | Sem limite documentado |
| EMSC SeismicPortal | `seismicportal.eu` | Fallback para terremotos quando USGS falha | Sem limite documentado |
| NASA EONET v3 | `eonet.gsfc.nasa.gov` | Eventos naturais na categoria `severeStorms` | Sem limite documentado |
| GDACS | `gdacs.org` | Fallback para tempestades quando EONET falha | Sem limite documentado |
| Open-Meteo | `api.open-meteo.com` | Condicoes meteorologicas atuais (vento, chuva, temperatura) | 10.000 chamadas/dia |
| INMET | `apitempo.inmet.gov.br` | Estacoes automaticas brasileiras (vento e chuva) | Sem limite documentado |
| ANA HidroWeb | `ana.gov.br` | Estacoes hidrometricas e niveis de rios | Sem limite documentado |
| NOAA SWPC | `services.swpc.noaa.gov` | Atividade solar (raios-X GOES e indice Kp) | Sem limite documentado |
| OpenStreetMap Nominatim | `nominatim.openstreetmap.org` | Geocodificacao reversa sob demanda | 1 req/s |
| OpenStreetMap Tiles | `tile.openstreetmap.org` | Tiles do mapa via Leaflet | Sem limite documentado |

## Arquitetura

```
index.html              - Estrutura da interface, filtros, paineis e carregamento via CDN
css/style.css           - Layout responsivo, tema escuro e estilos dos paineis
js/app.js               - Estado global, polling, filtros e fluxo principal
js/api.js               - Chamadas HTTP com fallback USGS->EMSC e EONET->GDACS
js/http.js              - Cliente HTTP compartilhado com retry, timeout e backoff
js/earthquakes.js       - Normalizacao USGS/EMSC e classificacao visual por magnitude
js/storms.js            - Normalizacao EONET/GDACS e deduplicacao por evento
js/winds.js             - Dados de vento Open-Meteo/INMET, grade regional e limiar 50 km/h
js/rain.js              - Dados de chuva Open-Meteo/INMET, historico 72h e extremos climaticos
js/floods.js            - Monitoramento de enchentes: estacoes ANA/HidroWeb e risco por precipitacao
js/solar.js             - Atividade solar NOAA SWPC: rajadas X e indice Kp
js/weather.js           - Consulta Open-Meteo por coordenada, cache em memoria e codigos WMO
js/geocoding.js         - Geocodificacao reversa e busca de localidades (Nominatim)
js/map.js               - Leaflet, marcadores, concentracao visual, popups e clima local
js/ui.js                - Leitura de filtros, indicadores, status de APIs, alertas e boletim
js/tv.js                - Modo TV: rotacao automatica, relógio, ticker, burn-in e watchdog
js/utils.js             - Utilitarios: parseNumber, isCriticalEvent, filterEvents, Haversine
js/quota.js             - Controle de quota diaria por API com reset automatico
tests.html              - Testes unitarios executaveis no navegador
```

## Modos de exibicao

### Modo normal
- Painel lateral com filtros, fontes de dados, alertas e boletim sismico
- Mapa interativo com popups de clima local ao clicar
- Barra de status com indicadores de cada API
- Banner de alertas criticos (M6+, vento 90+ km/h, chuva 10+ mm/h)
- Notificacoes do navegador para eventos criticos

### Modo TV (`?tv=1`)
- Exibicao passiva sem interacao
- Rotacao automatica entre visao mundial, Brasil e eventos criticos
- Relogio e data em tempo real
- Ticker com eventos recentes
- Protecao contra burn-in (deslocamento periodico)
- Detecao de inatividade e reload automatico

## Funcionalidades

### Eventos monitorados
- **Terremotos**: M2.5+ com classificacao de risco (magnitude x profundidade)
- **Tempestades**: Ciclones tropicais e tempestades severas (EONET/GDACS)
- **Ventos fortes**: Acima de 50 km/h com rajadas e direcao
- **Chuvas**: Precipitacao em tempo real com historico de 72h
- **Enchentes**: Niveis de rios (ANA/HidroWeb) e risco por precipitacao acumulada
- **Atividade solar**: Rajadas solares X/M e indice Kp

### Quota de APIs
- Open-Meteo: 10.000 chamadas/dia com fator de seguranca de 75%
- Polling adaptativo: intervalo calculado automaticamente para respeitar quota
- Exibicao de consumo no painel de fontes com barra de progresso
- Reset automatico diario

### Performance
- Carregamento progressivo: mapa renderiza imediatamente, dados em background
- Cache em memoria com TTL para Open-Meteo (10 min) e Nominatim (30 min)
- Rate limiting: debounce 650ms para Nominatim, cooldown 5 min para INMET
- DocumentFragment para renderizacao em lote
- Invalidacao de tamanho do mapa com debounce (150ms)

## Limitacoes

- Monitora dados publicados pelas fontes; nao faz previsao.
- Nao garante deteccao instantanea de eventos.
- A disponibilidade depende das APIs externas e de CORS.
- O clima local depende da disponibilidade do Open-Meteo.
- O nome da localidade em cliques no mapa depende da disponibilidade do Nominatim.
- A visualizacao de concentracao e uma camada visual simples com circulos transparentes, nao um modelo de risco.
- A ANA HidroWeb pode nao estar disponivel em todas as regioes.
