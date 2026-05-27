#include "wifi_manager.h"
#include "config_esp32.h"
#include <WiFi.h>

bool wifiConnect() {
    Serial.printf("[WiFi] Connecting to SSID: %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    const unsigned long timeout = 20000;
    const unsigned long start   = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start > timeout) {
            Serial.println("[WiFi] Connection timed out.");
            return false;
        }
        delay(250);
        Serial.print('.');
    }
    Serial.printf("\n[WiFi] Connected. IP: %s  RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
}
