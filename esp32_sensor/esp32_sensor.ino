#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>

// --- WiFi Settings ---
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";

// --- Server Settings ---
// Replace with the IP address of the computer running your Node.js server
const char *serverUrl = "http://192.168.1.100:3000/api/data";

// --- Sensor Pins ---
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

#define MQ135_PIN 34    // Analog pin for gas sensor
#define DUST_LED_PIN 5  // Digital pin for dust sensor LED
#define DUST_OUT_PIN 35 // Analog pin for dust sensor output

// --- Timing ---
unsigned long lastPostTime = 0;
const unsigned long postInterval = 3000; // Post every 3 seconds

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize sensors
  dht.begin();
  pinMode(DUST_LED_PIN, OUTPUT);
  pinMode(MQ135_PIN, INPUT);
  pinMode(DUST_OUT_PIN, INPUT);

  // Connect to WiFi
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (millis() - lastPostTime >= postInterval) {
    lastPostTime = millis();

    // 1. Read DHT22 (Temperature and Humidity)
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    // Check if DHT read failed
    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("Failed to read from DHT sensor!");
      temperature = 0;
      humidity = 0;
    }

    // 2. Read MQ-135 (Gas)
    int rawGas = analogRead(MQ135_PIN);
    // Simple scaling for demo purposes (actual PPM needs calibration curve)
    float gasPPM = map(rawGas, 0, 4095, 200, 1000);

    // 3. Read Dust Sensor (GP2Y1010AU0F)
    digitalWrite(DUST_LED_PIN, LOW);        // Turn on IR LED
    delayMicroseconds(280);                 // Wait 0.28ms
    int rawDust = analogRead(DUST_OUT_PIN); // Read analog value
    delayMicroseconds(40);                  // Wait 0.04ms
    digitalWrite(DUST_LED_PIN, HIGH);       // Turn off IR LED
    delayMicroseconds(9680);                // Wait for remainder of 10ms cycle

    // Convert to dust density (ug/m3) - approximation
    float calcVoltage = rawDust * (3.3 / 4095.0);
    float dustDensity = 0.17 * calcVoltage - 0.1;
    if (dustDensity < 0)
      dustDensity = 0;
    dustDensity *= 1000; // Convert mg/m3 to ug/m3

    // 4. Print values to Serial Monitor
    Serial.printf("Temp: %.1fC | Hum: %.1f%% | Gas: %.0f | Dust: %.0f\n",
                  temperature, humidity, gasPPM, dustDensity);

    // 5. Send POST request if WiFi is connected
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(serverUrl);
      http.addHeader("Content-Type", "application/json");

      // Construct JSON payload
      String jsonPayload = "{";
      jsonPayload += "\"temperature\":" + String(temperature, 1) + ",";
      jsonPayload += "\"humidity\":" + String(humidity, 1) + ",";
      jsonPayload += "\"gas\":" + String(gasPPM, 0) + ",";
      jsonPayload += "\"dust\":" + String(dustDensity, 0);
      jsonPayload += "}";

      // Send Request
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
}
