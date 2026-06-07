/**
 * EcoDash Server — ESP32 Environmental Dashboard Backend
 * -------------------------------------------------------
 * Express + WebSocket + SQLite
 * 
 * Endpoints:
 *   POST /api/data       — receive sensor data from ESP32
 *   GET  /api/history    — last N readings (?limit=100&from=&to=)
 *   GET  /api/stats      — min/max/avg per sensor (?from=&to=)
 *   GET  /api/alerts     — logged alert events (?limit=50&sensor=)
 *   GET  /api/status     — server health & connection info
 *   GET  /               — serves the dashboard (public/index.html)
 */

const express  = require('express');
const http     = require('http');
const WebSocket = require('ws');
const cors     = require('cors');
const Database = require('better-sqlite3');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database Setup ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'ecodash.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   DATETIME DEFAULT (datetime('now','localtime')),
    temperature REAL NOT NULL,
    humidity    REAL NOT NULL,
    gas         REAL NOT NULL,
    dust        REAL NOT NULL,
    source      TEXT DEFAULT 'esp32'
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT (datetime('now','localtime')),
    sensor    TEXT NOT NULL,
    level     TEXT NOT NULL,
    value     REAL NOT NULL,
    message   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings(timestamp);
  CREATE INDEX IF NOT EXISTS idx_alerts_sensor      ON alerts(sensor);
`);

// Prepared statements
const stmtInsertReading = db.prepare(`
  INSERT INTO readings (temperature, humidity, gas, dust, source)
  VALUES (@temperature, @humidity, @gas, @dust, @source)
`);

const stmtInsertAlert = db.prepare(`
  INSERT INTO alerts (sensor, level, value, message)
  VALUES (@sensor, @level, @value, @message)
`);

// ─── Sensor Thresholds ─────────────────────────────────────────────────────────
const THRESHOLDS = {
  temperature: { warning: 35,  danger: 40  },   // °C
  humidity:    { warningLow: 30, warningHigh: 70, dangerLow: 20, dangerHigh: 85 }, // %
  gas:         { warning: 400, danger: 700 },   // PPM
  dust:        { warning: 35,  danger: 150 }    // µg/m³
};

// Status labels for each sensor card
const STATUS_LABELS = {
  temperature: {
    normal:  'Optimal Range',
    warning: 'Elevated – Monitor',
    danger:  'Critical Level'
  },
  humidity: {
    normal:  'Optimal Range',
    warning: 'Outside Range',
    danger:  'Critical Level'
  },
  gas: {
    normal:  'Clean Air',
    warning: 'Elevated – Monitor',
    danger:  'Critical Level'
  },
  dust: {
    normal:  'Clean Air',
    warning: 'Elevated – Monitor',
    danger:  'Critical Level'
  }
};

// ─── In-Memory State ───────────────────────────────────────────────────────────
const MAX_BUFFER = 100;
let   dataBuffer    = [];
let   lastEsp32Time = null;
let   simulatorInterval = null;

// Track last alerted level per sensor to avoid duplicate DB inserts
let lastAlertState = {
  temperature: 'normal',
  humidity:    'normal',
  gas:         'normal',
  dust:        'normal'
};

// Pre-fill buffer from DB on startup
const bootRows = db.prepare('SELECT * FROM readings ORDER BY id DESC LIMIT ?').all(MAX_BUFFER);
dataBuffer = bootRows.reverse();
console.log(`[DB] Loaded ${dataBuffer.length} readings into buffer.`);

// ─── Threshold Analysis ────────────────────────────────────────────────────────
function analyzeReading(data) {
  const sensorStatus = { temperature: 'normal', humidity: 'normal', gas: 'normal', dust: 'normal' };
  const newAlerts    = [];

  // Temperature
  if (data.temperature > THRESHOLDS.temperature.danger) {
    sensorStatus.temperature = 'danger';
    newAlerts.push({ sensor: 'temperature', level: 'danger', value: data.temperature, message: `Temperature critical: ${data.temperature}°C (limit: ${THRESHOLDS.temperature.danger}°C)` });
  } else if (data.temperature > THRESHOLDS.temperature.warning) {
    sensorStatus.temperature = 'warning';
    newAlerts.push({ sensor: 'temperature', level: 'warning', value: data.temperature, message: `Temperature elevated: ${data.temperature}°C` });
  }

  // Humidity
  if (data.humidity > THRESHOLDS.humidity.dangerHigh || data.humidity < THRESHOLDS.humidity.dangerLow) {
    sensorStatus.humidity = 'danger';
    newAlerts.push({ sensor: 'humidity', level: 'danger', value: data.humidity, message: `Humidity critical: ${data.humidity}%` });
  } else if (data.humidity > THRESHOLDS.humidity.warningHigh || data.humidity < THRESHOLDS.humidity.warningLow) {
    sensorStatus.humidity = 'warning';
    newAlerts.push({ sensor: 'humidity', level: 'warning', value: data.humidity, message: `Humidity outside range: ${data.humidity}%` });
  }

  // Gas (MQ-135)
  if (data.gas > THRESHOLDS.gas.danger) {
    sensorStatus.gas = 'danger';
    newAlerts.push({ sensor: 'gas', level: 'danger', value: data.gas, message: `Gas level critical: ${data.gas} PPM (limit: ${THRESHOLDS.gas.danger} PPM)` });
  } else if (data.gas > THRESHOLDS.gas.warning) {
    sensorStatus.gas = 'warning';
    newAlerts.push({ sensor: 'gas', level: 'warning', value: data.gas, message: `Gas level elevated: ${data.gas} PPM` });
  }

  // Dust
  if (data.dust > THRESHOLDS.dust.danger) {
    sensorStatus.dust = 'danger';
    newAlerts.push({ sensor: 'dust', level: 'danger', value: data.dust, message: `Dust critical: ${data.dust} µg/m³ (limit: ${THRESHOLDS.dust.danger} µg/m³)` });
  } else if (data.dust > THRESHOLDS.dust.warning) {
    sensorStatus.dust = 'warning';
    newAlerts.push({ sensor: 'dust', level: 'warning', value: data.dust, message: `Dust elevated: ${data.dust} µg/m³` });
  }

  // Overall level = worst sensor
  const levels = Object.values(sensorStatus);
  const overallLevel = levels.includes('danger') ? 'danger' : levels.includes('warning') ? 'warning' : 'normal';

  return { sensorStatus, newAlerts, overallLevel };
}

// ─── Process & Broadcast Reading ──────────────────────────────────────────────
function processReading(rawData, source = 'esp32') {
  const data = {
    temperature: parseFloat(rawData.temperature.toFixed(1)),
    humidity:    parseFloat(rawData.humidity.toFixed(1)),
    gas:         Math.round(rawData.gas),
    dust:        Math.round(rawData.dust),
    source
  };

  // Persist to DB
  const result = stmtInsertReading.run(data);
  data.id        = result.lastInsertRowid;
  data.timestamp = new Date().toISOString();

  // Update circular buffer
  dataBuffer.push(data);
  if (dataBuffer.length > MAX_BUFFER) dataBuffer.shift();

  // Analyze thresholds
  const { sensorStatus, newAlerts, overallLevel } = analyzeReading(data);

  // Log new/changed alert states to DB
  for (const alert of newAlerts) {
    if (lastAlertState[alert.sensor] !== alert.level) {
      stmtInsertAlert.run(alert);
      lastAlertState[alert.sensor] = alert.level;
    }
  }
  // Reset sensors that returned to normal
  for (const sensor of ['temperature', 'humidity', 'gas', 'dust']) {
    if (sensorStatus[sensor] === 'normal' && lastAlertState[sensor] !== 'normal') {
      lastAlertState[sensor] = 'normal';
    }
  }

  // Build status labels for frontend
  const statusLabels = {};
  for (const sensor of ['temperature', 'humidity', 'gas', 'dust']) {
    statusLabels[sensor] = STATUS_LABELS[sensor][sensorStatus[sensor]];
  }

  // Compose broadcast message
  const payload = {
    type: 'reading',
    data,
    analysis: {
      overallLevel,
      sensorStatus,
      statusLabels,
      alerts: newAlerts
    },
    thresholds: THRESHOLDS
  };

  // Broadcast to all connected browsers
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });

  return payload;
}

// ─── Simulator ────────────────────────────────────────────────────────────────
// Drifts slowly around realistic base values to mimic a real sensor environment
let simState = { temperature: 28.0, humidity: 55.0, gas: 380.0, dust: 42.0 };

function drift(val, min, max, step) {
  const next = val + (Math.random() - 0.48) * step; // Slight upward bias
  return Math.max(min, Math.min(max, next));
}

function runSimulatorTick() {
  simState.temperature = drift(simState.temperature, 20, 48,  0.4);
  simState.humidity    = drift(simState.humidity,    15, 90,  1.2);
  simState.gas         = drift(simState.gas,        180, 850, 18);
  simState.dust        = drift(simState.dust,         5, 220,  8);
  processReading({ ...simState }, 'simulator');
}

function startSimulator() {
  if (simulatorInterval) return;
  console.log('[Simulator] Active — generating synthetic sensor data.');
  simulatorInterval = setInterval(runSimulatorTick, 3000);
}

function stopSimulator() {
  if (!simulatorInterval) return;
  clearInterval(simulatorInterval);
  simulatorInterval = null;
  console.log('[Simulator] Stopped — ESP32 is live.');
}

// Start simulator immediately; auto-restart if ESP32 goes silent
startSimulator();
setInterval(() => {
  const esp32Silent = !lastEsp32Time || (Date.now() - lastEsp32Time) >= 10000;
  if (esp32Silent && !simulatorInterval) startSimulator();
}, 5000);

// ─── REST API ──────────────────────────────────────────────────────────────────

// POST /api/data — receive sensor readings from ESP32
app.post('/api/data', (req, res) => {
  console.log(`[API] Incoming Sensor JSON:`, JSON.stringify(req.body));
  const { temperature, humidity, gas, dust } = req.body;

  if ([temperature, humidity, gas, dust].some(v => v === undefined || isNaN(Number(v)))) {
    console.error(`[API] Validation failed for payload:`, req.body);
    return res.status(400).json({ error: 'Missing or invalid fields. Required: temperature, humidity, gas, dust' });
  }

  lastEsp32Time = Date.now();
  stopSimulator();

  const result = processReading(
    { temperature: Number(temperature), humidity: Number(humidity), gas: Number(gas), dust: Number(dust) },
    'esp32'
  );

  res.json({ success: true, id: result.data.id, analysis: result.analysis });
});

// GET /api/history — paginated readings with optional date filter
app.get('/api/history', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 100, 2000);
  const from   = req.query.from;
  const to     = req.query.to;
  const source = req.query.source;

  let query  = 'SELECT * FROM readings WHERE 1=1';
  const params = [];

  if (from)   { query += ' AND timestamp >= ?'; params.push(from); }
  if (to)     { query += ' AND timestamp <= ?'; params.push(to); }
  if (source) { query += ' AND source = ?';     params.push(source); }

  query += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params);
  res.json({ count: rows.length, data: rows.reverse() });
});

// GET /api/stats — aggregate statistics per sensor
app.get('/api/stats', (req, res) => {
  const from   = req.query.from;
  const to     = req.query.to;
  let where    = 'WHERE 1=1';
  const params = [];

  if (from) { where += ' AND timestamp >= ?'; params.push(from); }
  if (to)   { where += ' AND timestamp <= ?'; params.push(to); }

  const stats = db.prepare(`
    SELECT
      COUNT(*)                     AS total_readings,
      ROUND(MIN(temperature), 1)   AS temp_min,
      ROUND(MAX(temperature), 1)   AS temp_max,
      ROUND(AVG(temperature), 2)   AS temp_avg,
      ROUND(MIN(humidity), 1)      AS hum_min,
      ROUND(MAX(humidity), 1)      AS hum_max,
      ROUND(AVG(humidity), 2)      AS hum_avg,
      ROUND(MIN(gas), 0)           AS gas_min,
      ROUND(MAX(gas), 0)           AS gas_max,
      ROUND(AVG(gas), 1)           AS gas_avg,
      ROUND(MIN(dust), 0)          AS dust_min,
      ROUND(MAX(dust), 0)          AS dust_max,
      ROUND(AVG(dust), 1)          AS dust_avg,
      MIN(timestamp)               AS first_reading,
      MAX(timestamp)               AS last_reading
    FROM readings ${where}
  `).get(...params);

  res.json({ ...stats, thresholds: THRESHOLDS });
});

// GET /api/alerts — alert event log
app.get('/api/alerts', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 50, 500);
  const sensor = req.query.sensor;
  const level  = req.query.level;

  let query  = 'SELECT * FROM alerts WHERE 1=1';
  const params = [];

  if (sensor) { query += ' AND sensor = ?'; params.push(sensor); }
  if (level)  { query += ' AND level = ?';  params.push(level); }

  query += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params);
  res.json({ count: rows.length, data: rows });
});

// GET /api/status — server health info
app.get('/api/status', (req, res) => {
  const totalReadings = db.prepare('SELECT COUNT(*) AS c FROM readings').get().c;
  const totalAlerts   = db.prepare('SELECT COUNT(*) AS c FROM alerts').get().c;
  const isSimulating  = !lastEsp32Time || (Date.now() - lastEsp32Time) >= 10000;

  res.json({
    status:             'online',
    uptime_seconds:     Math.floor(process.uptime()),
    total_readings:     totalReadings,
    total_alerts:       totalAlerts,
    source:             isSimulating ? 'simulator' : 'esp32',
    last_esp32_contact: lastEsp32Time ? new Date(lastEsp32Time).toISOString() : null,
    buffer_size:        dataBuffer.length,
    connected_clients:  wss.clients.size,
    thresholds:         THRESHOLDS
  });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WebSocket] Client connected (${ip}). Total: ${wss.clients.size}`);

  // Send last 20 readings immediately so the dashboard populates instantly
  const isSimulating = !lastEsp32Time || (Date.now() - lastEsp32Time) >= 10000;
  const initPayload  = JSON.stringify({
    type:       'init',
    data:       dataBuffer.slice(-20),
    source:     isSimulating ? 'simulator' : 'esp32',
    thresholds: THRESHOLDS
  });
  ws.send(initPayload);

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected. Total: ${wss.clients.size}`);
  });

  ws.on('error', err => {
    console.error('[WebSocket] Error:', err.message);
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log(`║  🌿 EcoDash Server Started             ║`);
  console.log(`║  Dashboard : http://localhost:${PORT}    ║`);
  console.log(`║  WebSocket : ws://localhost:${PORT}      ║`);
  console.log(`║  Database  : ecodash.db                ║`);
  console.log('╚════════════════════════════════════════╝\n');
});
