#include "wifi_manager.h"
#include "config.h"

#include <WiFi.h>
#include <Arduino.h>

static char s_ipBuffer[16] = {0};

bool wifiConnect(uint32_t timeoutMs) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.printf("[WiFi] Connecting to \"%s\"", WIFI_SSID);

    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start >= timeoutMs) {
            Serial.println("\n[WiFi] Timeout — could not connect");
            return false;
        }
        delay(500);
        Serial.print('.');
    }

    strncpy(s_ipBuffer, WiFi.localIP().toString().c_str(), sizeof(s_ipBuffer) - 1);
    Serial.printf("\n[WiFi] Connected — IP: %s  RSSI: %d dBm\n",
                  s_ipBuffer, WiFi.RSSI());
    return true;
}

bool wifiIsConnected() {
    return WiFi.status() == WL_CONNECTED;
}

const char* wifiGetIP() {
    return s_ipBuffer;
}

int32_t wifiGetRSSI() {
    return wifiIsConnected() ? WiFi.RSSI() : 0;
}
