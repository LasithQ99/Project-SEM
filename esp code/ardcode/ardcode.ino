
//  AIR QUALITY MONITOR — Complete Sketch
//  Board: ESP32-S3 UNO (ESP32-S3-WROOM-1)
// ============================================================
#include <Adafruit_AHTX0.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <Wire.h>
#include <math.h>

// ─── CONFIG — EDIT THESE ────────────────────────────────────
const char *WIFI_SSID = "MSI 7826";
const char *WIFI_PASS = "f17&213Q";
const char *SERVER_URL = "http://192.168.137.1:3000/api/data";

// ─── PINS ────────────────────────────────────────────────────
#define MQ135_PIN 1   // GPIO1 = A0 (ADC1 — safe with WiFi)
#define MQ5_PIN 2     // GPIO2 = A1 (ADC1)
#define MQ9_PIN 3     // GPIO3 = A2 (ADC1)
#define DSM501B_PIN 4 // GPIO4 = DSM501B Vout1 / Pin 4 (PM2.5 output)
#define LED_GREEN 11
#define LED_YELLOW 12
#define LED_RED 13
#define BUZZER_PIN 14
#define I2C_SDA 8
#define I2C_SCL 9

// ─── CALIBRATION — Update from calibration sketch ────────────
float MQ135_R0 = 76.63;
float MQ5_R0 = 6.47;
float MQ9_R0 = 9.43;
const float RL = 10.0;  // Load resistor (kΩ)
const float VCC = 3.33; // 5V × (20kΩ / (10+20)kΩ) = 3.33V (after divider)

// Gas curve parameters: PPM = a × (Rs/R0)^b
const float CO2_CURVE[2] = {116.60, -2.769}; // MQ-135
const float NH3_CURVE[2] = {102.20, -2.473}; // MQ-135
const float CO_CURVE[2] = {599.65, -2.244};  // MQ-9
const float CH4_CURVE[2] = {4269.6, -3.149}; // MQ-9
const float LPG_CURVE[2] = {503.34, -2.100}; // MQ-5
const float H2_CURVE[2] = {1010.6, -2.130};  // MQ-5

// ─── HARDWARE OBJECTS ────────────────────────────────────────
Adafruit_AHTX0 aht20;
LiquidCrystal_I2C lcd(0x27, 16, 4); // try 0x3F if not found

// ─── SENSOR DATA ─────────────────────────────────────────────
struct AirData {
  float temperature = 0, humidity = 0;
  float pm25 = 0;
  int aqi = 0;
  float caqi = 0;
  float co2_ppm = 0, nh3_ppm = 0;
  float co_ppm = 0, ch4_ppm = 0;
  float lpg_ppm = 0, h2_ppm = 0;
  String status = "Boot";
} air;

// ─── MOVING AVERAGE FILTER ───────────────────────────────────
#define MA_WIN 10
float buf135[MA_WIN] = {}, buf5[MA_WIN] = {}, buf9[MA_WIN] = {};
int bufIdx = 0;

float maFilter(float *buf, float val) {
  buf[bufIdx % MA_WIN] = val;
  float sum = 0;
  for (int i = 0; i < MA_WIN; i++)
    sum += buf[i];
  return sum / MA_WIN;
}

// ─── DSM501B PULSE COUNTER ────────────────────────────────────
unsigned long pulseTot = 0, sampleStart = 0;
const unsigned long SAMPLE_MS = 30000; // 30-second window

void pollDSM501B() {
  pulseTot += pulseIn(DSM501B_PIN, LOW, 1000000UL);
  if (millis() - sampleStart >= SAMPLE_MS) {
    float ratio = pulseTot / (SAMPLE_MS * 1000.0f);
    float conc = (1.1f * pow(ratio, 3)) - (3.8f * pow(ratio, 2)) +
                 (520.f * ratio) + 0.62f;
    air.pm25 = max(0.0f, conc * 0.5f); // convert to µg/m³
    pulseTot = 0;
    sampleStart = millis();
  }
}

// ─── MQ SENSOR READING ───────────────────────────────────────
float readRs(int pin) {
  float v = (analogRead(pin) / 4095.0f) * VCC;
  if (v < 0.01f)
    v = 0.01f;
  return ((VCC - v) / v) * RL;
}

float toPPM(float rs, float r0, const float curve[2]) {
  return curve[0] * pow(rs / r0, curve[1]);
}

void readMQSensors() {
  float rs135 = maFilter(buf135, readRs(MQ135_PIN));
  float rs5 = maFilter(buf5, readRs(MQ5_PIN));
  float rs9 = maFilter(buf9, readRs(MQ9_PIN));

  air.co2_ppm = constrain(toPPM(rs135, MQ135_R0, CO2_CURVE), 300, 10000);
  air.nh3_ppm = max(0.0f, toPPM(rs135, MQ135_R0, NH3_CURVE));
  air.co_ppm = max(0.0f, toPPM(rs9, MQ9_R0, CO_CURVE));
  air.ch4_ppm = max(0.0f, toPPM(rs9, MQ9_R0, CH4_CURVE));
  air.lpg_ppm = max(0.0f, toPPM(rs5, MQ5_R0, LPG_CURVE));
  air.h2_ppm = max(0.0f, toPPM(rs5, MQ5_R0, H2_CURVE));
}

// ─── AHT20 ───────────────────────────────────────────────────
void readAHT20() {
  sensors_event_t h, t;
  if (aht20.getEvent(&h, &t)) {
    air.temperature = t.temperature;
    air.humidity = h.relative_humidity;
  }
}

// ─── ALGORITHMS ──────────────────────────────────────────────
int calcAQI(float pm) {
  const float bp[7][4] = {{0.0, 12.0, 0, 50},       {12.1, 35.4, 51, 100},
                          {35.5, 55.4, 101, 150},   {55.5, 150.4, 151, 200},
                          {150.5, 250.4, 201, 300}, {250.5, 350.4, 301, 400},
                          {350.5, 500.4, 401, 500}};
  for (int i = 0; i < 7; i++)
    if (pm >= bp[i][0] && pm <= bp[i][1])
      return (int)((bp[i][3] - bp[i][2]) / (bp[i][1] - bp[i][0]) *
                       (pm - bp[i][0]) +
                   bp[i][2]);
  return 500;
}

float calcCAQI() {
  return 0.25f * (air.co2_ppm / 1000.f) + 0.30f * (air.co_ppm / 9.f) +
         0.15f * (air.nh3_ppm / 25.f) + 0.15f * (air.pm25 / 12.f) +
         0.08f * (air.ch4_ppm / 1000.f) + 0.07f * (air.lpg_ppm / 500.f);
}

String classify() {
  if (air.caqi > 2.0f || air.aqi > 200 || air.co_ppm > 50.f ||
      air.co2_ppm > 5000.f || air.lpg_ppm > 1000.f || air.pm25 > 150.f)
    return "Hazardous";

  if (air.caqi > 1.0f || air.aqi > 100 || air.co_ppm > 9.f ||
      air.co2_ppm > 1000.f || air.pm25 > 35.4f)
    return "Poor";

  return "Regular";
}

// ─── LCD DISPLAY & OUTPUTS ───────────────────────────────────
void updateLCD() {
  lcd.clear();
  char buf[17];

  lcd.setCursor(0, 0);
  snprintf(buf, 17, "%-9s AQI:%-3d", air.status.c_str(), air.aqi);
  lcd.print(buf);

  lcd.setCursor(0, 1);
  snprintf(buf, 17, "T:%4.1fC  H:%4.0f%%", air.temperature, air.humidity);
  lcd.print(buf);

  lcd.setCursor(0, 2);
  snprintf(buf, 17, "PM2.5:%5.1f CO:%4.1f", air.pm25, air.co_ppm);
  lcd.print(buf);

  lcd.setCursor(0, 3);
  snprintf(buf, 17, "CO2:%-5.0f LPG:%-4.0f", air.co2_ppm, air.lpg_ppm);
  lcd.print(buf);
}

void updateOutputs() {
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);
  noTone(BUZZER_PIN);

  if (air.status == "Regular") {
    digitalWrite(LED_GREEN, HIGH);
  } else if (air.status == "Poor") {
    digitalWrite(LED_YELLOW, HIGH);
    tone(BUZZER_PIN, 1000, 200);
  } else {
    digitalWrite(LED_RED, HIGH);
    for (int i = 0; i < 3; i++) {
      tone(BUZZER_PIN, 2500, 100);
      delay(200);
    }
    noTone(BUZZER_PIN);
  }
}

// ─── TRANSMIT DATA TO SERVER ─────────────────────────────────
void sendDataToServer() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["temperature"] = roundf(air.temperature * 10) / 10.f;
    doc["humidity"] = roundf(air.humidity * 10) / 10.f;
    doc["gas"] = (int)air.co2_ppm;              // MQ-135 CO2 PPM
    doc["dust"] = roundf(air.pm25 * 10) / 10.f; // DSM501B PM2.5 in ug/m3

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    // Debug output for sensors and JSON payload
    Serial.println("\n=== SENSOR DEBUG ===");
    Serial.printf("Temperature   : %.1f C\n", air.temperature);
    Serial.printf("Humidity      : %.1f %%\n", air.humidity);
    Serial.printf("Gas (MQ-135)  : %.0f PPM\n", air.co2_ppm);
    Serial.printf("Dust (PM2.5)  : %.1f ug/m3\n", air.pm25);
    Serial.printf("Other Gases   : NH3=%.1fppm, CO=%.1fppm, CH4=%.1fppm, "
                  "LPG=%.1fppm, H2=%.1fppm\n",
                  air.nh3_ppm, air.co_ppm, air.ch4_ppm, air.lpg_ppm,
                  air.h2_ppm);
    Serial.print("Generated JSON: ");
    Serial.println(jsonPayload);
    Serial.println("====================\n");

    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.printf("HTTP POST Success: %d\n", httpResponseCode);
    } else {
      Serial.printf("HTTP POST Error: %s\n",
                    http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  } else {
    Serial.println("WiFi Disconnected. Reconnecting...");
    WiFi.reconnect();
  }
}

// ─── SETUP ────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // Pin modes
  pinMode(DSM501B_PIN, INPUT);
  int outPins[] = {LED_GREEN, LED_YELLOW, LED_RED, BUZZER_PIN};
  for (int p : outPins)
    pinMode(p, OUTPUT);

  // LED self-test
  int ledPins[] = {LED_GREEN, LED_YELLOW, LED_RED};
  for (int p : ledPins) {
    digitalWrite(p, HIGH);
    delay(200);
    digitalWrite(p, LOW);
  }
  tone(BUZZER_PIN, 1500, 100);

  // I2C + LCD
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("AQM Booting...");

  // AHT20
  if (!aht20.begin()) {
    lcd.setCursor(0, 1);
    lcd.print("AHT20 ERROR!");
    Serial.println("AHT20 initialization failed! Scanning I2C bus...");
    for (byte address = 1; address < 127; address++) {
      Wire.beginTransmission(address);
      byte error = Wire.endTransmission();
      if (error == 0) {
        Serial.printf("I2C device found at address 0x%02X\n", address);
      }
    }
    while (1) {
      tone(BUZZER_PIN, 500);
      delay(500);
      noTone(BUZZER_PIN);
      delay(500);
    }
  }

  // ADC
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db); // 0-3.3V range

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lcd.setCursor(0, 1);
  lcd.print("WiFi...");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries++ < 30)
    delay(500);

  if (WiFi.status() == WL_CONNECTED) {
    String ip = WiFi.localIP().toString();
    lcd.setCursor(0, 2);
    lcd.print("WiFi Connected");
    lcd.setCursor(0, 3);
    lcd.print(ip);
    Serial.println("IP: " + ip);
  } else {
    lcd.setCursor(0, 2);
    lcd.print("WiFi: OFFLINE");
  }

  sampleStart = millis();
  delay(2000);
}

// ─── LOOP ─────────────────────────────────────────────────────
unsigned long tSensor = 0, tLCD = 0, tServer = 0;

void loop() {
  pollDSM501B();

  unsigned long now = millis();

  if (now - tSensor >= 2000) {
    tSensor = now;
    readAHT20();
    readMQSensors();
    air.aqi = calcAQI(air.pm25);
    air.caqi = calcCAQI();
    air.status = classify();
    bufIdx++;

    Serial.printf("T=%.1f H=%.0f PM=%.1f AQI=%d CO=%.1f CO2=%.0f → %s\n",
                  air.temperature, air.humidity, air.pm25, air.aqi, air.co_ppm,
                  air.co2_ppm, air.status.c_str());
  }

  if (now - tLCD >= 3000) {
    tLCD = now;
    updateLCD();
    updateOutputs();
  }

  if (now - tServer >= 3000 && WiFi.status() == WL_CONNECTED) {
    tServer = now;
    sendDataToServer();
  }
}