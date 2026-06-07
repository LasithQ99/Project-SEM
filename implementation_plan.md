# ESP32 EcoDash — Full Implementation Plan (with SQLite)

Real-time environmental dashboard: ESP32 sensors → Node.js backend (Express + WebSocket + SQLite) → EcoDash browser UI.

---

## Architecture

```
ESP32 (Sensors)
      │
      │  HTTP POST /api/data (JSON)
      ▼
┌─────────────────────────────────────┐
│         Node.js Server              │
│                                     │
│  Express  ──►  SQLite (ecodash.db)  │
│     │              │                │
│     │   in-memory  │  persist all   │
│     │   buffer     │  readings &    │
│     │   (last 100) │  alerts        │
│     ▼              │                │
│  WebSocket  ◄──────┘                │
│  Server                             │
└─────────┬───────────────────────────┘
          │  ws:// broadcast
          ▼
    Browser (EcoDash UI)
```

- **Backend**: Node.js · Express · `ws` · `better-sqlite3`
- **Frontend**: Existing EcoDash HTML + WebSocket client
- **Database**: SQLite (`ecodash.db`) — zero-config, file-based
- **Port**: `3000` (HTTP + WebSocket upgrade on same port)

---

## File Structure

```
d:\web dashboard\
├── server.js                 ← Node.js backend
├── package.json              ← npm dependencies
├── ecodash.db                ← SQLite DB (auto-created on first run)
├── public\
│   └── index.html            ← EcoDash dashboard (frontend)
└── esp32_sensor\
    └── esp32_sensor.ino      ← Arduino sketch for ESP32
```

---

## Database Schema (SQLite — `ecodash.db`)

### `readings` table — every sensor data point
```sql
CREATE TABLE IF NOT EXISTS readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
  temperature REAL NOT NULL,
  humidity    REAL NOT NULL,
  gas         REAL NOT NULL,
  dust        REAL NOT NULL,
  source      TEXT DEFAULT 'esp32'   -- 'esp32' or 'simulator'
);
```

### `alerts` table — every threshold crossing event
```sql
CREATE TABLE IF NOT EXISTS alerts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  sensor    TEXT NOT NULL,    -- 'temperature' | 'humidity' | 'gas' | 'dust'
  level     TEXT NOT NULL,    -- 'warning' | 'danger'
  value     REAL NOT NULL,
  message   TEXT
);
```

> [!NOTE]
> Both tables are created automatically on server first-run. No manual DB setup required.

---

## Sensor Thresholds

| Sensor | Normal | Warning | Danger |
|--------|--------|---------|--------|
| Temperature | < 35°C | 35 – 40°C | > 40°C |
| Humidity | 30 – 70% | 20–30% or 70–85% | < 20% or > 85% |
| Gas (MQ-135) | < 400 PPM | 400 – 700 PPM | > 700 PPM |
| Dust (PM) | < 35 µg/m³ | 35 – 150 µg/m³ | > 150 µg/m³ |

---

## Backend — `server.js`

### REST API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/data` | Receive sensor JSON from ESP32; save to DB; broadcast via WebSocket |
| `GET` | `/api/history` | Last N readings from DB (`?limit=100&sensor=all`) |
| `GET` | `/api/stats` | Min / max / avg per sensor (all-time or `?from=&to=` date range) |
| `GET` | `/api/alerts` | Logged alert events (`?limit=50&sensor=dust`) |
| `GET` | `/api/status` | Server uptime, total readings count, last seen ESP32 timestamp |
| `GET` | `/` | Serves `public/index.html` |

### ESP32 Payload Format
```json
{ "temperature": 28.4, "humidity": 55.2, "gas": 680, "dust": 185 }
```

### WebSocket Broadcast Payload
```json
{
  "type": "reading",
  "data": {
    "timestamp": "2025-05-19T18:30:00Z",
    "temperature": 28.4,
    "humidity": 55.2,
    "gas": 680,
    "dust": 185,
    "source": "esp32"
  },
  "alert": {
    "level": "danger",
    "sensors": ["dust"],
    "message": "Dust is at critical level (185 µg/m³)"
  }
}
```

### Simulator Mode
- Activates automatically when **no ESP32 POST has been received in the last 10 seconds**
- Generates realistic drifting sensor values every 3 seconds
- Saves simulator readings to DB with `source = 'simulator'`
- Broadcasts to WebSocket clients with `source: 'simulator'`
- Dashboard shows **"Simulator Active"** badge instead of **"Live (ESP32)"**

---

## Frontend — `public/index.html`

### Changes to Existing EcoDash UI (structure fully preserved)

1. **WebSocket client** replaces the `setInterval` fake data loop
   - Connects to `ws://localhost:3000`
   - Reconnects automatically if connection drops (exponential backoff)

2. **History pre-fill on load**
   - `GET /api/history?limit=20` called on page load
   - Atmospheric Trends chart populated with real historical data
   - Sparklines seeded with last 7 readings from DB

3. **Dynamic sensor status badges** on each sensor card
   - Label updates: `Optimal Range` / `Elevated - Monitor` / `Critical Level`
   - Card border/background color shifts with status level

4. **Dynamic System Status & Alerts section**
   - Alert text updates to describe which sensor(s) are in warning/danger
   - NORMAL / WARNING / DANGER indicator lights activate based on overall worst level
   - BEEPING icon active only during danger state

5. **Connection status bar** (top of main content)
   - `🟢 Node 1 (ESP32) · Live` — real ESP32 data
   - `🟡 Node 1 (ESP32) · Simulator` — no ESP32, simulator running
   - `🔴 Node 1 (ESP32) · Disconnected` — WebSocket lost
   - Shows **"Last updated: X seconds ago"** timestamp

6. **Atmospheric Trends chart** — rolling 20-point live window
   - Adds new point on every WebSocket reading
   - Drops oldest point to maintain rolling window

7. **Hazard Levels chart** — updates live with current readings vs. thresholds

---

## Backend — `package.json`

```json
{
  "name": "ecodash-server",
  "version": "1.0.0",
  "description": "ESP32 Environmental Dashboard Backend",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.16.0",
    "cors": "^2.8.5",
    "better-sqlite3": "^9.4.3"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

---

## ESP32 Arduino Sketch — `esp32_sensor.ino`

- Reads **DHT22** (temperature + humidity pin), **GP2Y1010AU0F** (dust, analog), **MQ-135** (gas, analog)
- Connects to Wi-Fi (SSID + password configured at top of file)
- POSTs JSON to `http://<YOUR_PC_IP>:3000/api/data` every 3 seconds
- Serial monitor output for debugging
- LED blink on successful POST

---

## Future Development-Ready Features (enabled by SQLite)

These are easy to add later because the data is already being stored:

| Feature | How |
|---------|-----|
| Historical charts (daily/weekly view) | `GET /api/history?from=&to=` |
| Peak value analysis | `GET /api/stats` |
| Alert history log page | `GET /api/alerts` |
| Data export (CSV) | New endpoint `GET /api/export.csv` |
| Threshold configuration UI | Store thresholds in a `settings` DB table |
| Multi-node support | Add `node_id` column to `readings` |

---

## Verification Plan

### Step 1 — Install & Start
```powershell
cd "d:\web dashboard"
npm install
node server.js
```

### Step 2 — Browser Test
Open `http://localhost:3000` → dashboard loads with simulator data running

### Step 3 — Manual ESP32 Endpoint Test
```powershell
curl -X POST http://localhost:3000/api/data `
  -H "Content-Type: application/json" `
  -d '{"temperature":29,"humidity":60,"gas":500,"dust":80}'
```
→ Dashboard should update within milliseconds; check DB with `GET http://localhost:3000/api/history`

### Step 4 — Threshold Test
POST values above danger thresholds → confirm DANGER indicator activates and alert is logged to `/api/alerts`

### Step 5 — Simulator Fallback
Wait 10 seconds without POSTing → confirm dashboard badge switches to "Simulator Active"
