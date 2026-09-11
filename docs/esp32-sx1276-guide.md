# Guia: ESP32 + SX1276 LoRa — Montagem Completa

## O que voce precisa

### Hardware

| Item | Preco | Onde comprar |
|------|-------|-------------|
| Modulo LoRa SX1276 433MHz | R$15-25 | [AliExpress](https://www.aliexpress.com/w/wholesale-SX1276-lora-module.html) |
| Cabos jumper macho-macho (40x) | R$5-8 | [AliExpress](https://www.aliexpress.com/w/wholesale-jumper-wire-male-to-male.html) |
| Antena helicoidal 433MHz SMA | R$8-15 | [AliExpress](https://www.aliexpress.com/w/wholesale-433MHz-antenna-SMA.html) |
| (Opcional) Bateria 18650 + TP4056 | R$10-15 | MercadoLivre |

### Software

- [Arduino IDE](https://www.arduino.cc/en/software) ou [PlatformIO](https://platformio.org/)
- [Meshtastic Web Flasher](https://flasher.meshtastic.org) (alternativa mais facil)

---

## Passo 1: Conexao dos Fios

### Pinagem SX1276

O modulo SX1276 tem 8 pinos. Conexao com ESP32:

```
SX1276               ESP32
──────               ─────
VCC          ──────── 3.3V    (NUNCA 5V!)
GND          ──────── GND
SCK          ──────── GPIO 18
MOSI         ──────── GPIO 23
MISO         ──────── GPIO 19
NSS (CS)     ──────── GPIO 5
RST          ──────── GPIO 15
DIO0         ──────── GPIO 2
```

### Diagrama visual

```
    ┌─────────────────────────────────────┐
    │           ESP32 DevKit              │
    │                                     │
    │   3.3V ──────────┐                 │
    │   GND  ──────┐   │                 │
    │   GPIO 18 ─┐ │   │                 │
    │   GPIO 23 ┐│ │   │                 │
    │   GPIO 19 ││ │   │                 │
    │   GPIO 5 ─┼┼─┼───┼──────────┐      │
    │   GPIO 15 ─┼┼─┼───┼────┐    │      │
    │   GPIO 2 ─┼┼─┼───┼──┐ │    │      │
    │            ││ │   │  │ │    │      │
    │            ││ │   │  │ │    │      │
    └────────────┼┼─┼───┼──┼─┼────┼──────┘
                 ││ │   │  │ │    │
                 ││ │   │  │ │    │
    ┌────────────┼┼─┼───┼──┼─┼────┼──────┐
    │  SX1276    ││ │   │  │ │    │      │
    │            ││ │   │  │ │    │      │
    │   SCK  ◄──┘│ │   │  │ │    │      │
    │   MOSI ◄───┘ │   │  │ │    │      │
    │   MISO ◄─────┘   │  │ │    │      │
    │   NSS  ◄──────────┘  │ │    │      │
    │   RST  ◄──────────────┘ │    │      │
    │   DIO0 ◄────────────────┘    │      │
    │   VCC  ◄─────────────────────┘      │
    │   GND  ◄────────────────────────────┘
    │                                     │
    │   [SMA] ← Antena 433MHz            │
    └─────────────────────────────────────┘
```

### Pinos importantes

| Pino SX1276 | Funcao | Pino ESP32 | Nota |
|-------------|--------|------------|------|
| VCC | Alimentacao | 3.3V | **NUNCA 5V** — queima o modulo |
| GND | Terra | GND | |
| SCK | Clock SPI | GPIO 18 | Padrao ESP32 |
| MOSI | Dados → SX | GPIO 23 | Padrao ESP32 |
| MISO | Dados ← SX | GPIO 19 | Padrao ESP32 |
| NSS | Chip Select | GPIO 5 | Pode mudar no firmware |
| RST | Reset | GPIO 15 | Pode mudar no firmware |
| DIO0 | IRQ (interrupcao) | GPIO 2 | **Obrigatorio** para Meshtastic |

---

## Passo 2: Flashear Meshtastic

### Opcao A: Web Flasher (mais facil)

1. Abra **Google Chrome** ou **Microsoft Edge**
2. Acesse [flasher.meshtastic.org](https://flasher.meshtastic.org)
3. Conecte o ESP32 via USB
4. Clique em **"Connect"** e selecione a porta serial
5. Selecione o firmware:
   - **Device:** `ESP32 Generic` (ou seu modelo especifico)
   - **Version:** `2.x` (ultima estavel)
   - **LoRa Module:** `SX1276 433MHz` (ou 915MHz para Brasil)
6. Clique **"Flash"**
7. Aguarde (1-2 minutos)

### Opcao B: Arduino IDE (controle total)

1. Instale o [Arduino IDE](https://www.arduino.cc/en/software)
2. Vá em `Arquivo > Preferencias` e adicione ao "Additional Boards Manager URLs":
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Vá em `Ferramentas > Placa > Boards Manager` e instale `esp32`
4. Selecione sua placa: `ESP32 Dev Module`
5. Baixe o [Meshtastic firmware](https://github.com/meshtastic/firmware) e abra o projeto
6. Configure em `src/mesh/Configuration.h`:
   ```cpp
   #define SX1276
   #define USE_SX1276
   ```
7. Compile e faca upload

### Opcao C: PlatformIO (recomendado para desenvolvedores)

```bash
# Instalar PlatformIO CLI
pip install platformio

# Clonar firmware
git clone https://github.com/meshtastic/firmware.git
cd firmware

# Compilar para ESP32 + SX1276
pio run -e esp32-lora-sx1276

# Flashear via USB
pio run -e esp32-lora-sx1276 --target upload
```

---

## Passo 3: Configurar Meshtastic

### Via app celular (recomendado)

1. Instale o app **Meshtastic** ([Play Store](https://play.google.com/store/apps/details?id=com.geeksville.mesh) / [App Store](https://apps.apple.com/app/meshtastic/id1598523412))
2. Ligue o ESP32
3. Abra o app → `Bluetooth` → pareie com seu ESP32
4. Configure:

### Configuracao basica

| Parametro | Valor para Brasil |
|-----------|------------------|
| Region | `US (915 MHz)` |
| Modem Preset | `Short Range` |
| TX Power | `20 dBm` (maximo) |
| Role | `CLIENT` (para nos normal) |

### Configurar canal

1. No app, va em `Channels`
2. Crie um canal privado (ex: `Familia`)
3. Configure criptografia AES-256
4. Compartilhe o QR code com outros nos

---

## Passo 4: Configurar Raspberry Pi B

### Instalar Mosquitto (broker MQTT)

```bash
# Atualizar sistema
sudo apt-get update && sudo apt-get upgrade -y

# Instalar Mosquitto
sudo apt-get install -y mosquitto mosquitto-clients

# Habilitar na inicializacao
sudo systemctl enable mosquitto
sudo systemctl start mosquitto

# Testar
mosquitto_sub -t "test/#" -h localhost
# (Em outro terminal)
mosquitto_pub -t "test/hello" -m "Funcionando!"
```

### Instalar o Dashboard

```bash
# Copiar o dashboard para o Pi
scp -r global-alert-dashboard/ pi@raspberrypi:/home/pi/

# Entrar no diretorio
cd /home/pi/global-alert-dashboard

# Iniciar servidor
python3 -m http.server 8080
```

### Conectar Meshtastic ao MQTT

O Meshtastic pode enviar mensagens via MQTT automaticamente. No app:

1. Va em `Configuracoes > MQTT`
2. Ative MQTT
3. Configure:
   - **Host:** IP do seu Pi B (ex: `192.168.1.100`)
   - **Port:** `1883`
   - **Topic:** `meshtastic`
   - **Username:** (deixe vazio para local)
   - **Password:** (deixe vazio para local)

---

## Passo 5: Testar a Conexao

### Teste 1: Verificar se o ESP32 esta funcionando

No Pi B:
```bash
# Ver dispositivos conectados ao Mosquitto
mosquitto_sub -t "meshtastic/#" -v

# Aguardando mensagens...
```

### Teste 2: Enviar mensagem de teste

No app Meshtastic, envie uma mensagem. Ela deve aparecer no Pi B:
```
meshtastic/hw/ESP32-telem {"battery":85, "voltage":3.8}
meshtastic/rectutil/... {"text":"Mensagem de teste"}
```

### Teste 3: Injetar alertas no dashboard

Crie um subscriber que converte mensagens Meshtastic em alertas:

```python
#!/usr/bin/env python3
"""Subscriber Meshtastic → Dashboard via MQTT"""

import json
import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT = 1883
TOPIC = "meshtastic/#"
ALERT_FILE = "/home/pi/global-alert-dashboard/data/alerts.jsonl"

def on_connect(client, userdata, flags, rc):
    print(f"Conectado ao Mosquitto (rc={rc})")
    client.subscribe(TOPIC)

def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        text = data.get("decoded", {}).get("text", "")
        
        if not text:
            return
        
        alert = {
            "id": f"mesh-{data.get('from', 'unknown')}-{data.get('time', '')}",
            "type": "alert",
            "title": text[:100],
            "description": text,
            "source": "Meshtastic LoRa",
            "offline": True,
            "offlineType": "meshtastic_lora",
            "timestamp": data.get("time", ""),
            "latitude": data.get("position", {}).get("latitude"),
            "longitude": data.get("position", {}).get("longitude")
        }
        
        with open(ALERT_FILE, "a") as f:
            f.write(json.dumps(alert) + "\n")
        
        print(f"Alerta salvo: {text[:50]}...")
        
    except Exception as e:
        print(f"Erro: {e}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect(BROKER, PORT, 60)
client.loop_forever()
```

Execute:
```bash
pip install paho-mqtt
python3 meshtastic_subscriber.py
```

---

## Passo 6: Integrar com o Dashboard

### No dashboard (Configuracoes > Fontes Offline)

1. Ative **Meshtastic (LoRa)**
2. Configure o endpoint: `ws://localhost:8083`
3. O dashboard conecta automaticamente

### Arquitetura final

```
┌──────────────────┐     ┌──────────────────┐
│  ESP32 + SX1276  │     │  ESP32 + SX1276  │
│  (No fixo)       │     │  (No portatil)   │
└────────┬─────────┘     └────────┬─────────┘
         │ LoRa 433MHz            │ LoRa 433MHz
         │ (2-20 km)              │ (2-20 km)
         └────────────┬───────────┘
                      │
         ┌────────────┴───────────┐
         │   Raspberry Pi B       │
         │                        │
         │  • Mosquitto (MQTT)    │
         │  • meshtastic_sub.py   │
         │  • Dashboard (8080)    │
         │                        │
         └────────────┬───────────┘
                      │ Browser
         ┌────────────┴───────────┐
         │   Seu PC / Celular     │
         │   http://pi:8080       │
         └────────────────────────┘
```

---

## Troubleshooting

### ESP32 nao liga
- Verifique se o cabo USB e de dados (nao so de carregamento)
- Teste outro cabo USB
- Pressione o botao BOOT por 3 segundos durante o flash

### Sem sinal LoRa
- Verifique a antena (esta conectada?)
- Confirme a frequencia: SX1276 433MHz so recebe em 433MHz
- Teste em ambiente aberto (paredes bloqueiam sinal)
- Aumente o ganho TX para 20dBm

### MQTT nao conecta
- Verifique o IP do Pi: `hostname -I`
- Teste: `mosquitto_sub -t "test/#" -h PI_IP`
- Verifique firewall: `sudo ufw allow 1883`
- Reinicie Mosquitto: `sudo systemctl restart mosquitto`

### ESP32 reinicia sozinho
- Alimentacao USB instavel — use fonte 5V 2A
- Problema de solda nos fios — refaça as conexoes
- SX1276 puxando muito corrente — adicione capacitor 100uF no VCC

---

## Links Uteis

- [Meshtastic Docs](https://meshtastic.org/docs/getting-started/)
- [Meshtastic Firmware](https://github.com/meshtastic/firmware)
- [Meshtastic Web Flasher](https://flasher.meshtastic.org)
- [MQTT Explorer](https://mqtt-explorer.com/) (teste visual de mensagens MQTT)
- [SX1276 Datasheet](https://www.semtech.com/uploads/documents/DS_SX1276-7-8-9_WAPP-v2.1.pdf)
