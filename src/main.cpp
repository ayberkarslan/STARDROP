#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <vector>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "swd.h"
#include "web_page.h"

// ==============================================================================
// 1. AYARLAR VE YAPILANDIRMA
// ==============================================================================
const char* FALLBACK_AP_SSID = "STARDROP-Setup";
const char* FALLBACK_AP_PASS = "12345678";
const char* MDNS_HOSTNAME    = "stardrop"; // http://stardrop.local
const byte  DNS_PORT         = 53;

// ==============================================================================
// 2. PIN TANIMLAMALARI (ESP32-C3 Super Mini -> STM32 SWD)
// ==============================================================================
// SWD Protokolü (ST-Link Modu):
#define SWD_CLK_PIN       20   // ESP32-C3 GPIO 20 ➔ STM32 PA14 (SWCLK / Morpho CN10 Pin 15)
#define SWD_DIO_PIN       21   // ESP32-C3 GPIO 21 ➔ STM32 PA13 (SWDIO / Morpho CN10 Pin 13)
#define STM32_RST_PIN     3    // ESP32-C3 GPIO 3  ➔ STM32 NRST (RESET / CN7 Pin 14)
#define ONBOARD_LED_PIN   8    // ESP32-C3 Super Mini Mavi LED (GPIO 8)
#define FLASH_START_ADDR  0x08000000

// Donanım ve Sistem Nesneleri
SWDFlasher swd;
WebServer server(80);
DNSServer dnsServer;
Preferences prefs;

struct SavedNetwork {
    String ssid;
    String password;
};

std::vector<SavedNetwork> savedNetworks;
std::vector<uint8_t> firmwareBuffer;
bool apModeActive = false;
unsigned long lastWifiCheck = 0;

// ==============================================================================
// 4. ÇOKLU AĞ HAFIZASI YÖNETİMİ (NVS / PREFERENCES)
// ==============================================================================

void loadSavedNetworks() {
    savedNetworks.clear();
    prefs.begin("stardrop_net", false);
    int count = prefs.getInt("count", 0);

    // İlk kullanımda hiç ağ yoksa varsayılan ağı kaydet:
    if (count == 0) {
        prefs.putInt("count", 1);
        prefs.putString("s_0", "mayberk");
        prefs.putString("p_0", "tiramisu13");
        count = 1;
    }

    for (int i = 0; i < count; i++) {
        String sKey = "s_" + String(i);
        String pKey = "p_" + String(i);
        String s = prefs.getString(sKey.c_str(), "");
        String p = prefs.getString(pKey.c_str(), "");
        if (s.length() > 0) {
            savedNetworks.push_back({s, p});
        }
    }
    prefs.end();
    Serial.printf("[NVS] %d adet kayıtlı ağ yüklendi.\n", (int)savedNetworks.size());
}

void saveNetworkToNVS(const String& ssid, const String& pass) {
    // Listede zaten varsa şifresini güncelle, yoksa ekle
    bool found = false;
    for (auto& net : savedNetworks) {
        if (net.ssid == ssid) {
            net.password = pass;
            found = true;
            break;
        }
    }
    if (!found) {
        savedNetworks.push_back({ssid, pass});
    }

    prefs.begin("stardrop_net", false);
    prefs.putInt("count", savedNetworks.size());
    for (size_t i = 0; i < savedNetworks.size(); i++) {
        String sKey = "s_" + String(i);
        String pKey = "p_" + String(i);
        prefs.putString(sKey.c_str(), savedNetworks[i].ssid);
        prefs.putString(pKey.c_str(), savedNetworks[i].password);
    }
    prefs.end();
    Serial.printf("[NVS] Ağ kaydedildi: %s\n", ssid.c_str());
}

void removeNetworkFromNVS(const String& ssid) {
    for (auto it = savedNetworks.begin(); it != savedNetworks.end(); ++it) {
        if (it->ssid == ssid) {
            savedNetworks.erase(it);
            break;
        }
    }
    prefs.begin("stardrop_net", false);
    prefs.clear(); // Temizle ve yeniden yaz
    prefs.putInt("count", savedNetworks.size());
    for (size_t i = 0; i < savedNetworks.size(); i++) {
        String sKey = "s_" + String(i);
        String pKey = "p_" + String(i);
        prefs.putString(sKey.c_str(), savedNetworks[i].ssid);
        prefs.putString(pKey.c_str(), savedNetworks[i].password);
    }
    prefs.end();
    Serial.printf("[NVS] Ağ silindi: %s\n", ssid.c_str());
}

const char* AP_SSID = "STARDROP-OTA";
const char* AP_PASS = "12345678";

void initNetworkSubsystem() {
    Serial.println("\n[WI-FI] STARDROP-OTA Hotspot ve Ağ Altyapısı başlatılıyor...");

    WiFi.persistent(false);
    WiFi.disconnect(true, true);
    delay(100);

    // Eşzamanlı AP + STA Modu
    WiFi.mode(WIFI_AP_STA);
    delay(100);

    IPAddress local_ip(192, 168, 4, 1);
    IPAddress gateway(192, 168, 4, 1);
    IPAddress subnet(255, 255, 255, 0);

    WiFi.softAPConfig(local_ip, gateway, subnet);
    bool apOk = WiFi.softAP(AP_SSID, AP_PASS, 6, 0, 4);
    WiFi.setSleep(false);
    WiFi.setTxPower(WIFI_POWER_11dBm);

    dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
    dnsServer.start(DNS_PORT, "*", local_ip);
    apModeActive = true;

    Serial.printf("[HOTSPOT] '%s' (Kanal 6): %s | IP: %s\n", 
                  AP_SSID, apOk ? "BAŞARILI (YAYINDA)" : "BAŞARISIZ", WiFi.softAPIP().toString().c_str());

    // Kayıtlı ev/atölye ağlarına bağlanmayı dene
    bool staConnected = false;
    for (const auto& net : savedNetworks) {
        Serial.printf("[WI-FI] Kayıtlı ağ deneniyor: '%s' ... ", net.ssid.c_str());
        WiFi.begin(net.ssid.c_str(), net.password.c_str());

        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < 4000) {
            delay(100);
            digitalWrite(ONBOARD_LED_PIN, !digitalRead(ONBOARD_LED_PIN));
        }

        if (WiFi.status() == WL_CONNECTED) {
            staConnected = true;
            digitalWrite(ONBOARD_LED_PIN, LOW); // Sabit Açık
            Serial.printf("BAĞLANDI!\n[WI-FI] Yerel IP: %s\n", WiFi.localIP().toString().c_str());

            if (MDNS.begin("stardrop")) {
                MDNS.addService("http", "tcp", 80);
                Serial.println("[mDNS] http://stardrop.local AKTİF!");
            }
            break;
        } else {
            Serial.println("bağlanılamadı.");
        }
    }

    if (!staConnected) {
        Serial.println("[WI-FI] Sadece STARDROP-OTA (192.168.4.1) üzerinden çalışılıyor.");
    }
}

// ==============================================================================
// 5. WEB SUNUCUSU VE CANLI SWD FLASH AKIŞI
// ==============================================================================

bool isIp(const String& str) {
    for (size_t i = 0; i < str.length(); i++) {
        int c = str.charAt(i);
        if (c != '.' && (c < '0' || c > '9')) return false;
    }
    return true;
}

void handleRoot() {
    server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    server.send_P(200, "text/html", INDEX_HTML);
}

void handleNotFound() {
    String uri = server.uri();
    if (uri.indexOf("204") != -1 || uri.indexOf("connecttest") != -1 || uri.indexOf("ncsi") != -1) {
        server.send(204, "text/plain", "");
        return;
    }
    if (uri.endsWith(".ico") || uri.endsWith(".png") || uri.endsWith(".map")) {
        server.send(204, "text/plain", "");
        return;
    }
    handleRoot();
}

void sendSSE(const String& msg, const String& type = "info", int pct = -1, const String& chunks = "") {
    String json = "data: {\"msg\":\"" + msg + "\",\"type\":\"" + type + "\"";
    if (pct >= 0) json += ",\"pct\":" + String(pct);
    if (chunks.length() > 0) json += ",\"chunks\":\"" + chunks + "\"";
    json += "}\n\n";
    server.sendContent(json);
    Serial.println(msg);
}

void handleStreamFlash() {
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "text/event-stream", "");

    if (firmwareBuffer.empty()) {
        sendSSE("HATA: Firmware dosyası bulunamadı!", "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }

    uint32_t totalBytes = firmwareBuffer.size();
    uint32_t totalChunks = (totalBytes + 255) / 256;

    sendSSE("[1/4] ARM Cortex-M SWD bağlantısı kuruluyor (ST-Link Modu)...", "info", 5);
    swd.begin(SWD_CLK_PIN, SWD_DIO_PIN, STM32_RST_PIN);

    uint32_t idcode = 0;
    if (!swd.connect(&idcode)) {
        char errBuf[128];
        snprintf(errBuf, sizeof(errBuf), "[HATA] ARM SWD DAP el sıkışma başarısız! (ACK: %d, IDCODE: 0x%08X)", swd.lastAck, swd.lastIdcode);
        sendSSE(String(errBuf), "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }

    char idMsg[64];
    snprintf(idMsg, sizeof(idMsg), "[OK] ARM CoreSight DAP Bağlandı! (IDCODE: 0x%08X)", idcode);
    sendSSE(String(idMsg), "success", 8);

    // Akıllı Hedef İşlemci Teşhisi
    TargetDiagnostics diag = swd.inspectAndDiagnose();
    sendSSE("[DURUM] " + diag.statusSummary, diag.isLockup ? "warn" : "info", 11);
    sendSSE("[STRATEJİ] " + diag.actionTaken, "info", 13);

    // Çekirdeği Durdur / Gerekirse HardFault Kurtar
    if (!swd.haltAndRecover()) {
        sendSSE("[UYARI] CPU dondurulamadı, doğrudan flash yazmaya devam ediliyor...", "warn", 14);
    } else {
        sendSSE("[OK] STM32 Cortex-M4 çekirdeği kontrol altına alındı (Core Halted).", "success", 15);
    }

    // Gerekliyse Flash Kilidini Aç
    if (!swd.unlockFlashIfNeeded()) {
        sendSSE("[HATA] STM32 Flash Kontrolcüsü kilidi açılamadı!", "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }
    sendSSE("[OK] STM32 Flash Kontrolcüsü kilidi açık.", "success", 16);

    sendSSE("[2/4] Flash belleği siliniyor (SWD Mass Erase)...", "info", 18);
    if (!swd.massErase()) {
        sendSSE("[HATA] Flash silme başarısız oldu!", "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }
    sendSSE("[OK] Flash tamamen silindi. ~2.5 MHz Auto-Increment Burst ile yazma başlıyor...", "success", 22);

    uint32_t currentAddr = FLASH_START_ADDR;
    uint8_t chunk[256];
    uint8_t verifyBuf[256];

    for (uint32_t i = 0; i < totalChunks; i++) {
        uint32_t offset = i * 256;
        memset(chunk, 0xFF, 256);

        if (offset + 256 > totalBytes) {
            memcpy(chunk, &firmwareBuffer[offset], totalBytes - offset);
        } else {
            memcpy(chunk, &firmwareBuffer[offset], 256);
        }

        if (!swd.writeBlock(currentAddr, chunk, 256)) {
            char buf[64];
            snprintf(buf, sizeof(buf), "[HATA] 0x%08X SWD yazma başarısız!", currentAddr);
            sendSSE(String(buf), "error");
            server.sendContent("data: {\"error\":true}\n\n");
            return;
        }

        if (!swd.readBlock(currentAddr, verifyBuf, 256) || memcmp(chunk, verifyBuf, 256) != 0) {
            char buf[64];
            snprintf(buf, sizeof(buf), "[DOĞRULAMA HATASI] 0x%08X verisi uyuşmadı!", currentAddr);
            sendSSE(String(buf), "error");
            server.sendContent("data: {\"error\":true}\n\n");
            return;
        }

        int pct = 22 + ((i + 1) * 76) / totalChunks;
        char hexAddr[16];
        snprintf(hexAddr, sizeof(hexAddr), "0x%08X", currentAddr);
        String chunkInfo = String(i + 1) + " / " + String(totalChunks) + " Blok";

        sendSSE("[SWD] " + String(hexAddr) + " ➔ 256B Yazıldı + Doğrulandı (OK)", "chunk", pct, chunkInfo);
        currentAddr += 256;
    }

    sendSSE("[4/4] STM32 Sıfırlanıyor ve Normal Çalışma Moduna geçiriliyor...", "info", 99);
    swd.resetAndRun();

    char successMsg[80];
    snprintf(successMsg, sizeof(successMsg), "[TAMAMLANDI] Toplam %u bayt SWD ile hatasız yüklendi ve çalışıyor!", totalBytes);
    sendSSE(String(successMsg), "success", 100);

    server.sendContent("data: {\"done\":true}\n\n");
}

void handleFileUpload() {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
        firmwareBuffer.clear();
        firmwareBuffer.reserve(65536);
    } else if (upload.status == UPLOAD_FILE_WRITE) {
        firmwareBuffer.insert(firmwareBuffer.end(), upload.buf, upload.buf + upload.currentSize);
    } else if (upload.status == UPLOAD_FILE_END) {
        server.send(200, "application/json", "{\"status\":\"ok\",\"size\":" + String(firmwareBuffer.size()) + "}");
    }
}

// ==============================================================================
// 8. WI-FI REST API ENDPOINT'LERİ (AĞ YÖNETİMİ)
// ==============================================================================

void handleWifiStatus() {
    String json = "{";
    json += "\"connected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
    json += "\"ssid\":\"" + (WiFi.status() == WL_CONNECTED ? WiFi.SSID() : "") + "\",";
    json += "\"ip\":\"" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : (apModeActive ? WiFi.softAPIP().toString() : "")) + "\",";
    json += "\"rssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + ",";
    json += "\"apMode\":" + String(apModeActive ? "true" : "false") + ",";
    json += "\"saved\":[";
    for (size_t i = 0; i < savedNetworks.size(); i++) {
        json += "\"" + savedNetworks[i].ssid + "\"";
        if (i < savedNetworks.size() - 1) json += ",";
    }
    json += "]}";
    server.send(200, "application/json", json);
}

void handleWifiScan() {
    int n = WiFi.scanNetworks();
    String json = "[";
    for (int i = 0; i < n; ++i) {
        json += "{";
        json += "\"ssid\":\"" + WiFi.SSID(i) + "\",";
        json += "\"rssi\":" + String(WiFi.RSSI(i)) + ",";
        json += "\"secure\":" + String(WiFi.encryptionType(i) != WIFI_AUTH_OPEN ? "true" : "false");
        json += "}";
        if (i < n - 1) json += ",";
    }
    json += "]";
    WiFi.scanDelete();
    server.send(200, "application/json", json);
}

void handleWifiAdd() {
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        // Basit JSON parse: {"ssid":"...","pass":"..."}
        int sIdx = body.indexOf("\"ssid\":\"");
        int pIdx = body.indexOf("\"pass\":\"");
        if (sIdx != -1 && pIdx != -1) {
            sIdx += 8;
            int sEnd = body.indexOf("\"", sIdx);
            pIdx += 8;
            int pEnd = body.indexOf("\"", pIdx);
            String newSsid = body.substring(sIdx, sEnd);
            String newPass = body.substring(pIdx, pEnd);

            saveNetworkToNVS(newSsid, newPass);
            server.send(200, "application/json", "{\"status\":\"ok\"}");

            // Arka planda yeni ağa bağlanmayı dene
            initNetworkSubsystem();
            return;
        }
    }
    server.send(400, "application/json", "{\"status\":\"error\"}");
}

void handleWifiRemove() {
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        int sIdx = body.indexOf("\"ssid\":\"");
        if (sIdx != -1) {
            sIdx += 8;
            int sEnd = body.indexOf("\"", sIdx);
            String delSsid = body.substring(sIdx, sEnd);
            removeNetworkFromNVS(delSsid);
            server.send(200, "application/json", "{\"status\":\"ok\"}");
            return;
        }
    }
    server.send(400, "application/json", "{\"status\":\"error\"}");
}

// ==============================================================================
// 9. SETUP & LOOP
// ==============================================================================

void setup() {
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

    Serial.begin(115200);
    delay(1000);
    Serial.println("\n==============================================");
    Serial.println("  STARDROP • Yıldız Roket Takımı Aviyonik OTA ");
    Serial.println("==============================================");

    pinMode(ONBOARD_LED_PIN, OUTPUT);
    digitalWrite(ONBOARD_LED_PIN, LOW);

    pinMode(STM32_RST_PIN, OUTPUT);
    digitalWrite(STM32_RST_PIN, HIGH);

    // 1. Kayıtlı Ağları NVS'den Yükle
    loadSavedNetworks();

    // 2. Ağ Alt Yapısını Başlat (AP + STA Eşzamanlı)
    initNetworkSubsystem();

    // 3. Web Sunucu Rotaları
    server.on("/", HTTP_GET, handleRoot);
    server.on("/ping", HTTP_GET, []() {
        server.sendHeader("Cache-Control", "no-cache");
        server.send(200, "application/json", "{\"status\":\"ok\",\"uptime\":" + String(millis() / 1000) + "}");
    });

    server.on("/upload", HTTP_POST, []() {}, handleFileUpload);
    server.on("/stream-flash", HTTP_GET, handleStreamFlash);

    // Wi-Fi Yönetim API Rotaları
    server.on("/api/wifi/status", HTTP_GET, handleWifiStatus);
    server.on("/api/wifi/scan", HTTP_GET, handleWifiScan);
    server.on("/api/wifi/add", HTTP_POST, handleWifiAdd);
    server.on("/api/wifi/remove", HTTP_POST, handleWifiRemove);

    // Captive Portal Rotaları
    server.on("/generate_204", HTTP_GET, handleNotFound);
    server.on("/gen_204", HTTP_GET, handleNotFound);
    server.on("/hotspot-detect.html", HTTP_GET, handleNotFound);
    server.on("/connecttest.txt", HTTP_GET, handleNotFound);
    server.on("/ncsi.txt", HTTP_GET, handleNotFound);
    server.on("/favicon.ico", HTTP_GET, []() { server.send(204, "text/plain", ""); });
    server.onNotFound(handleNotFound);

    server.begin();
    Serial.println("[OK] STARDROP Web Sunucusu Hazır.");
}

void loop() {
    if (apModeActive) {
        dnsServer.processNextRequest();
    }
    server.handleClient();
}
