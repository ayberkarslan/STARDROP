#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <NetBIOS.h>
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
const uint16_t DISCOVERY_PORT = 4210;
const char* DISCOVERY_REQUEST = "STARDROP_DISCOVER_V1";

// ==============================================================================
// 2. PIN TANIMLAMALARI (ESP32 -> STM32 SWD)
// ==============================================================================
// Pinler platformio.ini içinden seçilir. STM32_RST_PIN=-1 verilirse SWD,
// yalnızca SWCLK + SWDIO ile çalışır; reset altında kilitlenmiş hedefi kurtaramaz.
#ifndef SWD_CLK_PIN
#define SWD_CLK_PIN       25
#endif
#ifndef SWD_DIO_PIN
#define SWD_DIO_PIN       26
#endif
#ifndef STM32_RST_PIN
#define STM32_RST_PIN     27
#endif
#ifndef ONBOARD_LED_PIN
#define ONBOARD_LED_PIN   2
#endif

static bool statusLedOn = false;

void setStatusLed(bool on) {
    statusLedOn = on;
#if defined(ONBOARD_LED_RGB) && ONBOARD_LED_RGB
    // Adreslenebilir RGB LED, digitalWrite ile kapatılamaz.
    neopixelWrite(ONBOARD_LED_PIN, 0, 0, on ? 12 : 0);
#else
    digitalWrite(ONBOARD_LED_PIN, on ? HIGH : LOW);
#endif
}
#define FLASH_START_ADDR  0x08000000
#define DIAGNOSTIC_REPORT_ADDR 0x20000100UL
#define DIAGNOSTIC_REPORT_SIZE 128U
#define DIAGNOSTIC_REPORT_MAGIC 0x53545250UL // "STRP"
#define DIAGNOSTIC_REPORT_ABI 1U

// Donanım ve Sistem Nesneleri
SWDFlasher swd;
WebServer server(80);
DNSServer dnsServer;
Preferences prefs;
WiFiUDP discoveryUdp;

struct SavedNetwork {
    String ssid;
    String password;
};

std::vector<SavedNetwork> savedNetworks;
std::vector<uint8_t> firmwareBuffer;
bool apModeActive = false;
unsigned long lastWifiCheck = 0;

// 0: AUTO (Turbo -> Fast -> Safe), 1: Turbo, 2: Fast, 3: Safe.
uint8_t configuredSpeedMode = 0;
String lastFlashResult = "Henüz programlama yapılmadı";
String lastFlashProfile = "-";
String lastFlashDiagnostics = "-";
uint32_t lastTargetIdcode = 0;
uint32_t lastFlashDurationMs = 0;

struct KnownTarget {
    String uid;
    String label;
};
std::vector<KnownTarget> knownTargets;
String lastSeenTargetUid = "";

const char* speedProfileName(SwdSpeedProfile profile) {
    switch (profile) {
        case SwdSpeedProfile::TURBO: return "TURBO";
        case SwdSpeedProfile::FAST: return "FAST";
        case SwdSpeedProfile::SAFE: return "SAFE";
    }
    return "BILINMIYOR";
}

const char* configuredSpeedModeName() {
    switch (configuredSpeedMode) {
        case 1: return "turbo";
        case 2: return "fast";
        case 3: return "safe";
        default: return "auto";
    }
}

void loadProgrammerSettings() {
    prefs.begin("stardrop_cfg", true);
    configuredSpeedMode = prefs.getUChar("speed_mode", 0);
    prefs.end();
    if (configuredSpeedMode > 3) configuredSpeedMode = 0;
}

void saveProgrammerSettings() {
    prefs.begin("stardrop_cfg", false);
    prefs.putUChar("speed_mode", configuredSpeedMode);
    prefs.end();
}

void loadKnownTargets() {
    knownTargets.clear();
    prefs.begin("stardrop_targets", true);
    int count = prefs.getInt("count", 0);
    for (int i = 0; i < count; ++i) {
        String uid = prefs.getString(("u_" + String(i)).c_str(), "");
        String label = prefs.getString(("n_" + String(i)).c_str(), "");
        if (uid.length() && label.length()) knownTargets.push_back({uid, label});
    }
    prefs.end();
}

String labelForUid(const String& uid) {
    for (const auto& target : knownTargets) {
        if (target.uid == uid) return target.label;
    }
    return "";
}

void saveTargetLabel(const String& uid, const String& label) {
    bool found = false;
    for (auto& target : knownTargets) {
        if (target.uid == uid) { target.label = label; found = true; break; }
    }
    if (!found) knownTargets.push_back({uid, label});

    prefs.begin("stardrop_targets", false);
    prefs.clear();
    prefs.putInt("count", knownTargets.size());
    for (size_t i = 0; i < knownTargets.size(); ++i) {
        prefs.putString(("u_" + String(i)).c_str(), knownTargets[i].uid);
        prefs.putString(("n_" + String(i)).c_str(), knownTargets[i].label);
    }
    prefs.end();
}

// ==============================================================================
// 4. ÇOKLU AĞ HAFIZASI YÖNETİMİ (NVS / PREFERENCES)
// ==============================================================================

void loadSavedNetworks() {
    savedNetworks.clear();
    prefs.begin("stardrop_net", false);
    int count = prefs.getInt("count", 0);

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
    delay(50);

    // Eşzamanlı AP + STA Modu
    WiFi.mode(WIFI_AP_STA);
    WiFi.setHostname("stardrop");
    WiFi.softAPsetHostname("stardrop");
    delay(50);

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
        WiFi.setHostname("stardrop");
        WiFi.begin(net.ssid.c_str(), net.password.c_str());

        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < 4000) {
            delay(100);
            setStatusLed(!statusLedOn);
        }

        if (WiFi.status() == WL_CONNECTED) {
            staConnected = true;
            setStatusLed(false);
            Serial.printf("BAĞLANDI!\n[WI-FI] Yerel IP: %s\n", WiFi.localIP().toString().c_str());

            MDNS.end();
            if (MDNS.begin("stardrop")) {
                MDNS.setInstanceName("stardrop");
                MDNS.addService("http", "tcp", 80);
                MDNS.addServiceTxt("http", "tcp", "path", "/");
                Serial.println("[mDNS] http://stardrop.local ve http://stardrop AKTİF!");
            }
            NBNS.begin("stardrop");
            Serial.println("[NetBIOS] 'stardrop' Windows ve Samba cihazları için AKTİF!");
            break;
        } else {
            Serial.println("bağlanılamadı.");
        }
    }

    if (!staConnected) {
        Serial.println("[WI-FI] Sadece STARDROP-OTA (192.168.4.1) üzerinden çalışılıyor.");
        MDNS.end();
        MDNS.begin("stardrop");
        MDNS.addService("http", "tcp", 80);
        NBNS.begin("stardrop");
    }
}

// ==============================================================================
// 4. YEREL AĞ CİHAZ KEŞFİ (UDP)
// ==============================================================================
// Bilgisayardaki stardrop_discover.py aynı yerel ağa broadcast gönderir. ESP
// cevabı isteği gönderen cihaza unicast döner; internet veya sabit IP gerekmez.
void initDiscoveryService() {
    if (discoveryUdp.begin(DISCOVERY_PORT)) {
        Serial.printf("[DISCOVERY] UDP cihaz keşfi portu hazır: %u\n", DISCOVERY_PORT);
    } else {
        Serial.println("[DISCOVERY] UDP portu açılamadı!");
    }
}

void handleDiscoveryService() {
    int packetSize = discoveryUdp.parsePacket();
    if (packetSize <= 0) return;

    char request[64] = {0};
    int readLen = discoveryUdp.read(request, sizeof(request) - 1);
    if (readLen <= 0 || strcmp(request, DISCOVERY_REQUEST) != 0) return;

    bool staConnected = WiFi.status() == WL_CONNECTED;
    String response = "{\"protocol\":\"stardrop-discovery-v1\",";
    response += "\"name\":\"stardrop\",";
    response += "\"mac\":\"" + WiFi.macAddress() + "\",";
    response += "\"staConnected\":" + String(staConnected ? "true" : "false") + ",";
    response += "\"ip\":\"" + (staConnected ? WiFi.localIP().toString() : WiFi.softAPIP().toString()) + "\",";
    response += "\"apIp\":\"" + WiFi.softAPIP().toString() + "\",";
    response += "\"httpPort\":80,";
    response += "\"rssi\":" + String(staConnected ? WiFi.RSSI() : 0);
    response += "}";

    discoveryUdp.beginPacket(discoveryUdp.remoteIP(), discoveryUdp.remotePort());
    discoveryUdp.print(response);
    discoveryUdp.endPacket();
    Serial.printf("[DISCOVERY] Yanıt gönderildi: %s:%u\n",
                  discoveryUdp.remoteIP().toString().c_str(), discoveryUdp.remotePort());
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

enum class FlashAttemptResult : uint8_t { SUCCESS, CONNECT, HALT, UNLOCK, ERASE, WRITE, VERIFY };

FlashAttemptResult flashAtSpeed(SwdSpeedProfile profile, uint32_t totalBytes, uint32_t totalChunks) {
    swd.setSpeedProfile(profile);
    swd.resetTransferStats();
    swd.begin(SWD_CLK_PIN, SWD_DIO_PIN, STM32_RST_PIN);
    sendSSE("[HIZ] " + String(speedProfileName(profile)) + " profili bağlantı kararlılığı test ediliyor...", "info", 4);

    uint32_t idcode = 0;
    uint32_t confirmIdcode = 0;
    if (!swd.connect(&idcode) || !swd.connect(&confirmIdcode) || idcode != confirmIdcode) {
        return FlashAttemptResult::CONNECT;
    }
    lastTargetIdcode = idcode;
    char idMsg[96];
    snprintf(idMsg, sizeof(idMsg), "[OK] %s kararlı: CoreSight DAP 0x%08X", speedProfileName(profile), idcode);
    sendSSE(String(idMsg), "success", 8);

    TargetDiagnostics diag = swd.inspectAndDiagnose();
    sendSSE("[DURUM] " + diag.statusSummary, diag.isLockup ? "warn" : "info", 11);
    sendSSE("[STRATEJİ] " + diag.actionTaken, "info", 13);

    if (!swd.haltAndRecover()) return FlashAttemptResult::HALT;
    sendSSE("[OK] STM32 Cortex-M4 çekirdeği kontrol altına alındı (Core Halted).", "success", 15);

    if (!swd.unlockFlashIfNeeded()) return FlashAttemptResult::UNLOCK;
    sendSSE("[OK] STM32 Flash Kontrolcüsü kilidi açık.", "success", 16);

    sendSSE("[2/4] Firmware'in kullandığı flash sektörleri siliniyor...", "info", 18);
    uint8_t erasedSectors = 0;
    uint16_t flashSizeKb = 0;
    if (!swd.eraseImageSectors(totalBytes, &erasedSectors, &flashSizeKb)) return FlashAttemptResult::ERASE;
    String eraseInfo = "[OK] " + String(erasedSectors) + " gerekli sektör silindi";
    if (flashSizeKb > 0) eraseInfo += " (hedef flash: " + String(flashSizeKb) + " KB)";
    eraseInfo += ". " + String(speedProfileName(profile)) + " Auto-Increment Burst ile yazma + zorunlu doğrulama başlıyor...";
    sendSSE(eraseInfo, "success", 22);

    uint32_t currentAddr = FLASH_START_ADDR;
    uint8_t chunk[256];
    uint8_t verifyBuf[256];
    for (uint32_t i = 0; i < totalChunks; i++) {
        uint32_t offset = i * 256;
        memset(chunk, 0xFF, sizeof(chunk));
        uint32_t bytesHere = totalBytes - offset;
        if (bytesHere > sizeof(chunk)) bytesHere = sizeof(chunk);
        memcpy(chunk, &firmwareBuffer[offset], bytesHere);

        if (!swd.writeBlock(currentAddr, chunk, sizeof(chunk))) return FlashAttemptResult::WRITE;
        if (!swd.readBlock(currentAddr, verifyBuf, sizeof(verifyBuf)) || memcmp(chunk, verifyBuf, sizeof(chunk)) != 0) {
            return FlashAttemptResult::VERIFY;
        }

        int pct = 22 + ((i + 1) * 76) / totalChunks;
        char hexAddr[16];
        snprintf(hexAddr, sizeof(hexAddr), "0x%08X", currentAddr);
        String chunkInfo = String(i + 1) + " / " + String(totalChunks) + " Blok";
        sendSSE("[SWD] " + String(hexAddr) + " ➔ 256B Yazıldı + Doğrulandı (OK)", "chunk", pct, chunkInfo);
        currentAddr += sizeof(chunk);
    }
    return FlashAttemptResult::SUCCESS;
}

String flashFailureMessage(FlashAttemptResult result) {
    switch (result) {
        case FlashAttemptResult::CONNECT: return "SWD bağlantısı/IDCODE kararsız";
        case FlashAttemptResult::HALT: return "CPU dondurulamadı";
        case FlashAttemptResult::UNLOCK: return "Flash kilidi açılamadı";
        case FlashAttemptResult::ERASE: return "Flash silme başarısız";
        case FlashAttemptResult::WRITE: return "SWD yazma/flash hazır olma hatası";
        case FlashAttemptResult::VERIFY: return "Readback doğrulama uyuşmazlığı";
        default: return "Bilinmeyen hata";
    }
}

void handleStreamFlash() {
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "text/event-stream", "");
    if (firmwareBuffer.empty()) {
        sendSSE("HATA: Firmware dosyası bulunamadı!", "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }

    const SwdSpeedProfile autoProfiles[] = {SwdSpeedProfile::TURBO, SwdSpeedProfile::FAST, SwdSpeedProfile::SAFE};
    SwdSpeedProfile requestedProfiles[] = {SwdSpeedProfile::FAST};
    const SwdSpeedProfile* profiles = requestedProfiles;
    uint8_t profileCount = 1;
    if (configuredSpeedMode == 0) { profiles = autoProfiles; profileCount = 3; }
    else if (configuredSpeedMode == 1) requestedProfiles[0] = SwdSpeedProfile::TURBO;
    else if (configuredSpeedMode == 3) requestedProfiles[0] = SwdSpeedProfile::SAFE;

    uint32_t startedAt = millis();
    uint32_t totalBytes = firmwareBuffer.size();
    uint32_t totalChunks = (totalBytes + 255) / 256;
    FlashAttemptResult result = FlashAttemptResult::CONNECT;
    bool success = false;
    for (uint8_t attempt = 0; attempt < profileCount; ++attempt) {
        result = flashAtSpeed(profiles[attempt], totalBytes, totalChunks);
        lastFlashProfile = speedProfileName(profiles[attempt]);
        lastFlashDiagnostics = swd.transferDiagnostics();
        if (result == FlashAttemptResult::SUCCESS) { success = true; break; }
        if (attempt + 1 < profileCount) {
            sendSSE("[HIZ UYARISI] " + String(speedProfileName(profiles[attempt])) + " profili: " + flashFailureMessage(result) + ". Daha güvenli profile yeniden deneniyor. " + lastFlashDiagnostics, "warn", 5);
        }
    }
    lastFlashDurationMs = millis() - startedAt;

    if (!success) {
        lastFlashResult = "HATA: " + flashFailureMessage(result);
        sendSSE("[HATA] " + lastFlashResult + " | " + lastFlashDiagnostics, "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }

    sendSSE("[4/4] STM32 sıfırlanıyor ve normal çalışma moduna geçiriliyor...", "info", 99);
    swd.resetAndRun();
    lastFlashResult = "BAŞARILI";
    char successMsg[128];
    snprintf(successMsg, sizeof(successMsg), "[TAMAMLANDI] %u bayt %s profiliyle doğrulandı (%lums).", totalBytes, lastFlashProfile.c_str(), lastFlashDurationMs);
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
// 8. WI-FI REST API ENDPOINT'LERİ (AĞ YÖNETİMİ & HIZLI GEÇİŞ)
// ==============================================================================

int calcRssiPct(int rssi) {
    if (rssi >= -50) return 100;
    if (rssi <= -100) return 0;
    return 2 * (rssi + 100);
}

bool doWifiSwitch = false;
String targetSwitchSsid = "";
String targetSwitchPass = "";

void handleWifiStatus() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Cache-Control", "no-cache");

    bool isSta = (WiFi.status() == WL_CONNECTED);
    int rssi = isSta ? WiFi.RSSI() : 0;
    int pct = isSta ? calcRssiPct(rssi) : 0;

    String json = "{";
    json += "\"connected\":" + String(isSta ? "true" : "false") + ",";
    json += "\"ssid\":\"" + (isSta ? WiFi.SSID() : "") + "\",";
    json += "\"ip\":\"" + (isSta ? WiFi.localIP().toString() : WiFi.softAPIP().toString()) + "\",";
    json += "\"rssi\":" + String(rssi) + ",";
    json += "\"pct\":" + String(pct) + ",";
    json += "\"apSsid\":\"" + String(AP_SSID) + "\",";
    json += "\"apIp\":\"" + WiFi.softAPIP().toString() + "\",";
    json += "\"saved\":[";
    for (size_t i = 0; i < savedNetworks.size(); i++) {
        json += "\"" + savedNetworks[i].ssid + "\"";
        if (i < savedNetworks.size() - 1) json += ",";
    }
    json += "]}";
    server.send(200, "application/json", json);
}

void handleProgrammerStatus() {
    String json = "{";
    json += "\"speedMode\":\"" + String(configuredSpeedModeName()) + "\",";
    json += "\"verifyRequired\":true,";
    json += "\"swclkPin\":" + String(SWD_CLK_PIN) + ",";
    json += "\"swdioPin\":" + String(SWD_DIO_PIN) + ",";
    json += "\"resetAvailable\":" + String(STM32_RST_PIN >= 0 ? "true" : "false") + ",";
    json += "\"lastResult\":\"" + lastFlashResult + "\",";
    json += "\"lastProfile\":\"" + lastFlashProfile + "\",";
    json += "\"lastDiagnostics\":\"" + lastFlashDiagnostics + "\",";
    json += "\"lastTargetIdcode\":\"0x" + String(lastTargetIdcode, HEX) + "\",";
    json += "\"lastDurationMs\":" + String(lastFlashDurationMs);
    json += "}";
    server.send(200, "application/json", json);
}

void handleProgrammerSettings() {
    if (!server.hasArg("plain")) {
        server.send(400, "application/json", "{\"status\":\"error\"}");
        return;
    }
    String body = server.arg("plain");
    if (body.indexOf("\"speedMode\":\"auto\"") >= 0) configuredSpeedMode = 0;
    else if (body.indexOf("\"speedMode\":\"turbo\"") >= 0) configuredSpeedMode = 1;
    else if (body.indexOf("\"speedMode\":\"fast\"") >= 0) configuredSpeedMode = 2;
    else if (body.indexOf("\"speedMode\":\"safe\"") >= 0) configuredSpeedMode = 3;
    else {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Geçersiz hız profili\"}");
        return;
    }
    saveProgrammerSettings();
    server.send(200, "application/json", "{\"status\":\"ok\",\"speedMode\":\"" + String(configuredSpeedModeName()) + "\"}");
}

const char* stm32ModelName(uint16_t deviceId) {
    switch (deviceId) {
        case 0x413: return "STM32F405/F407/F415/F417";
        case 0x419: return "STM32F42x/F43x";
        case 0x421: return "STM32F446";
        case 0x423: return "STM32F401";
        case 0x433: return "STM32F401";
        case 0x431: return "STM32F411";
        default: return "Bilinmeyen STM32";
    }
}

String formatTargetUid(const TargetProbeInfo& target) {
    char uid[25];
    snprintf(uid, sizeof(uid), "%08lX%08lX%08lX",
             (unsigned long)target.uid[0], (unsigned long)target.uid[1], (unsigned long)target.uid[2]);
    return String(uid);
}

void handleTargetStatus() {
    // Durum taraması, seçili flash hızından bağımsız olarak FAST'te yapılır:
    // ekranın "hedef yok" demesi Turbo temas marjına bağlı kalmasın.
    swd.setSpeedProfile(SwdSpeedProfile::FAST);
    swd.begin(SWD_CLK_PIN, SWD_DIO_PIN, STM32_RST_PIN);
    TargetProbeInfo target;
    if (!swd.probe(&target)) {
        const uint32_t fastDpIdcode = swd.lastProbeDpIdcode;
        const String fastStage = swd.lastProbeStage;
        const uint8_t fastAck = swd.lastAck;
        swd.setSpeedProfile(SwdSpeedProfile::SAFE);
        swd.begin(SWD_CLK_PIN, SWD_DIO_PIN, STM32_RST_PIN);
        if (!swd.probe(&target)) {
            const bool fastGotFurther = fastDpIdcode != 0 && swd.lastProbeDpIdcode == 0;
            const uint32_t dpIdcode = fastGotFurther ? fastDpIdcode : swd.lastProbeDpIdcode;
            const String stage = fastGotFurther ? fastStage : String(swd.lastProbeStage);
            const uint8_t ack = fastGotFurther ? fastAck : swd.lastAck;
            char dpHex[11];
            snprintf(dpHex, sizeof(dpHex), "0x%08lX", (unsigned long)dpIdcode);
            String json = "{\"connected\":false,\"dpConnected\":" + String(dpIdcode ? "true" : "false");
            json += ",\"dpIdcode\":\"" + String(dpHex) + "\",\"stage\":\"" + stage + "\",\"ack\":" + String(ack) + "}";
            server.send(200, "application/json", json);
            return;
        }
    }

    String uid = formatTargetUid(target);
    lastSeenTargetUid = uid;
    String label = labelForUid(uid);

    String json = "{";
    json += "\"connected\":true,";
    json += "\"model\":\"" + String(stm32ModelName(target.deviceId)) + "\",";
    json += "\"deviceId\":\"0x" + String(target.deviceId, HEX) + "\",";
    json += "\"revisionId\":\"0x" + String(target.revisionId, HEX) + "\",";
    json += "\"flashSizeKb\":" + String(target.flashSizeKb) + ",";
    json += "\"dpIdcode\":\"0x" + String(target.dpIdcode, HEX) + "\",";
    json += "\"uid\":\"" + uid + "\",";
    json += "\"label\":\"" + label + "\"";
    json += "}";
    server.send(200, "application/json", json);
}

void handleTargetLabel() {
    if (lastSeenTargetUid.length() == 0 || !server.hasArg("plain")) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Önce hedef taranmalı\"}");
        return;
    }
    String body = server.arg("plain");
    const String marker = "\"label\":\"";
    int start = body.indexOf(marker);
    if (start < 0) { server.send(400, "application/json", "{\"status\":\"error\"}"); return; }
    start += marker.length();
    int end = body.indexOf('"', start);
    if (end < start) { server.send(400, "application/json", "{\"status\":\"error\"}"); return; }
    String label = body.substring(start, end);
    label.trim();
    if (!label.length() || label.length() > 32 || label.indexOf('\\') >= 0) {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Geçersiz kart adı\"}");
        return;
    }
    saveTargetLabel(lastSeenTargetUid, label);
    server.send(200, "application/json", "{\"status\":\"ok\"}");
}

void handleTargetFlashUsage() {
    swd.setSpeedProfile(SwdSpeedProfile::FAST);
    swd.begin(SWD_CLK_PIN, SWD_DIO_PIN, STM32_RST_PIN);
    TargetProbeInfo target;
    if (!swd.probe(&target) || target.flashSizeKb == 0 || target.flashSizeKb > 1024) {
        server.send(503, "application/json", "{\"status\":\"error\",\"message\":\"Hedef okunamadı\"}");
        return;
    }

    const uint32_t totalBytes = (uint32_t)target.flashSizeKb * 1024UL;
    uint8_t buffer[256];
    uint32_t programmedBytes = 0;
    uint32_t startedAt = millis();
    for (uint32_t offset = 0; offset < totalBytes; offset += sizeof(buffer)) {
        if (!swd.readBlock(FLASH_START_ADDR + offset, buffer, sizeof(buffer))) {
            server.send(503, "application/json", "{\"status\":\"error\",\"message\":\"Flash okuma hatası\"}");
            return;
        }
        for (uint16_t i = 0; i < sizeof(buffer); ++i) {
            if (buffer[i] != 0xFF) programmedBytes++;
        }
        if ((offset & 0x1FFF) == 0) delay(0); // Wi-Fi görevine kısa nefes alanı
    }

    String json = "{\"status\":\"ok\",\"totalBytes\":" + String(totalBytes) +
                  ",\"programmedBytes\":" + String(programmedBytes) +
                  ",\"freeBytes\":" + String(totalBytes - programmedBytes) +
                  ",\"durationMs\":" + String(millis() - startedAt) + "}";
    server.send(200, "application/json", json);
}

uint32_t readLe32(const uint8_t* bytes) {
    return (uint32_t)bytes[0] | ((uint32_t)bytes[1] << 8) |
           ((uint32_t)bytes[2] << 16) | ((uint32_t)bytes[3] << 24);
}

uint16_t readLe16(const uint8_t* bytes) {
    return (uint16_t)bytes[0] | ((uint16_t)bytes[1] << 8);
}

uint32_t diagnosticReportCrc32(const uint8_t* bytes, uint16_t length) {
    uint32_t crc = 0xFFFFFFFFUL;
    for (uint16_t i = 0; i < length; ++i) {
        crc ^= bytes[i];
        for (uint8_t bit = 0; bit < 8; ++bit) {
            crc = (crc >> 1) ^ (0xEDB88320UL & (-(int32_t)(crc & 1U)));
        }
    }
    return ~crc;
}

const char* diagnosticStateName(uint32_t state) {
    switch (state) {
        case 0: return "IDLE";
        case 1: return "RUNNING";
        case 2: return "PASS";
        case 3: return "FAIL";
        case 4: return "FATAL";
        default: return "UNKNOWN";
    }
}

// Test firmware'i, diagnostics/runtime/stardrop_diagnostic_report.h içindeki
// 128B ABI'yi SRAM'e yazar. Bu salt-okunur endpoint CPU'yu durdurmadan yalnız
// SWCLK + SWDIO üzerinden sonucu alır.
void handleDiagnosticReport() {
    swd.setSpeedProfile(SwdSpeedProfile::FAST);
    swd.begin(SWD_CLK_PIN, SWD_DIO_PIN, STM32_RST_PIN);
    TargetProbeInfo target;
    if (!swd.probe(&target)) {
        server.send(200, "application/json", "{\"connected\":false,\"valid\":false,\"ack\":" + String(swd.lastAck) + "}");
        return;
    }

    uint8_t report[DIAGNOSTIC_REPORT_SIZE];
    if (!swd.readBlock(DIAGNOSTIC_REPORT_ADDR, report, sizeof(report))) {
        server.send(200, "application/json", "{\"connected\":true,\"valid\":false,\"reason\":\"SRAM_READ_FAILED\"}");
        return;
    }

    const uint32_t magic = readLe32(report);
    const uint16_t abi = readLe16(report + 4);
    const uint16_t size = readLe16(report + 6);
    const uint32_t sequenceStart = readLe32(report + 8);
    const uint32_t state = readLe32(report + 12);
    const uint32_t error = readLe32(report + 16);
    const uint32_t crc = readLe32(report + 120);
    const uint32_t sequenceEnd = readLe32(report + 124);
    const bool valid = magic == DIAGNOSTIC_REPORT_MAGIC && abi == DIAGNOSTIC_REPORT_ABI &&
                       size == DIAGNOSTIC_REPORT_SIZE && sequenceStart != 0 &&
                       sequenceStart == sequenceEnd && crc == diagnosticReportCrc32(report, 120);

    String json = "{\"connected\":true,\"valid\":" + String(valid ? "true" : "false") + ",";
    json += "\"state\":\"" + String(diagnosticStateName(state)) + "\",";
    json += "\"stateCode\":" + String(state) + ",\"error\":" + String(error) + ",";
    json += "\"testIdHash\":\"0x" + String(readLe32(report + 20), HEX) + "\",";
    json += "\"profileHash\":\"0x" + String(readLe32(report + 24), HEX) + "\",";
    json += "\"expectedDeviceId\":\"0x" + String(readLe32(report + 28), HEX) + "\",";
    json += "\"observedDeviceId\":\"0x" + String(readLe32(report + 32), HEX) + "\",";
    json += "\"primaryMilli\":" + String((int32_t)readLe32(report + 36)) + ",";
    json += "\"secondaryMilli\":" + String((int32_t)readLe32(report + 40)) + ",";
    json += "\"runHash\":\"0x" + String(readLe32(report + 52), HEX) + "\",";
    json += "\"elapsedMs\":" + String(readLe32(report + 44)) + ",";
    json += "\"detailCode\":" + String(readLe32(report + 48));
    if (!valid) json += ",\"reason\":\"ABI_OR_CRC_INVALID\"";
    json += "}";
    server.send(200, "application/json", json);
}

void handleStreamTargetFlashUsage() {
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "text/event-stream", "");

    // Bu işlem yalnız okur. Analizdeki yoğun trafik için Turbo kullanılır;
    // sonuçta ACK/parity hatası görülürse arayüz sonucu güvenilir saymaz.
    swd.setSpeedProfile(SwdSpeedProfile::TURBO);
    swd.resetTransferStats();
    swd.begin(SWD_CLK_PIN, SWD_DIO_PIN, STM32_RST_PIN);
    TargetProbeInfo target;
    if (!swd.probe(&target) || target.flashSizeKb == 0 || target.flashSizeKb > 1024) {
        sendSSE("[HATA] Flash analizi için hedef okunamadı.", "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }

    const uint32_t totalBytes = (uint32_t)target.flashSizeKb * 1024UL;
    const uint32_t progressStep = 8 * 1024UL;
    uint8_t buffer[256];
    uint32_t programmedBytes = 0;
    uint32_t startedAt = millis();
    sendSSE("[ANALİZ] " + String(target.flashSizeKb) + " KB flash, hızlı salt-okunur taramaya alındı.", "info", 0);

    for (uint32_t offset = 0; offset < totalBytes; offset += sizeof(buffer)) {
        if (!swd.readBlock(FLASH_START_ADDR + offset, buffer, sizeof(buffer))) {
            sendSSE("[HATA] Flash okuma hatası.", "error");
            server.sendContent("data: {\"error\":true}\n\n");
            return;
        }
        for (uint16_t i = 0; i < sizeof(buffer); ++i) {
            if (buffer[i] != 0xFF) programmedBytes++;
        }
        uint32_t completed = offset + sizeof(buffer);
        if (completed % progressStep == 0 || completed >= totalBytes) {
            int pct = (completed * 100UL) / totalBytes;
            sendSSE("[ANALİZ] " + String(completed / 1024) + " / " + String(totalBytes / 1024) + " KB tarandı.", "chunk", pct);
        }
        if ((offset & 0x1FFF) == 0) delay(0);
    }

    uint32_t duration = millis() - startedAt;
    String diagnostics = swd.transferDiagnostics();
    if (swd.ackFaultCount || swd.parityErrorCount) {
        sendSSE("[HATA] Analiz sırasında SWD hattı kararsız: " + diagnostics, "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }
    String result = "data: {\"done\":true,\"totalBytes\":" + String(totalBytes) +
                    ",\"programmedBytes\":" + String(programmedBytes) +
                    ",\"freeBytes\":" + String(totalBytes - programmedBytes) +
                    ",\"durationMs\":" + String(duration) + "}\n\n";
    server.sendContent(result);
}

void handleWifiScan() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    int n = WiFi.scanNetworks(false, true, false, 80); // Hızlı ve kesintisiz 80ms tarama
    String json = "[";
    for (int i = 0; i < n; ++i) {
        int r = WiFi.RSSI(i);
        json += "{";
        json += "\"ssid\":\"" + WiFi.SSID(i) + "\",";
        json += "\"rssi\":" + String(r) + ",";
        json += "\"pct\":" + String(calcRssiPct(r)) + ",";
        json += "\"secure\":" + String(WiFi.encryptionType(i) != WIFI_AUTH_OPEN ? "true" : "false");
        json += "}";
        if (i < n - 1) json += ",";
    }
    json += "]";
    WiFi.scanDelete();
    server.send(200, "application/json", json);
}

void handleWifiSwitch() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        int sIdx = body.indexOf("\"ssid\":");
        if (sIdx != -1) {
            int q1 = body.indexOf("\"", sIdx + 7);
            int q2 = body.indexOf("\"", q1 + 1);
            String ssid = body.substring(q1 + 1, q2);
            for (const auto& net : savedNetworks) {
                if (net.ssid == ssid) {
                    targetSwitchSsid = net.ssid;
                    targetSwitchPass = net.password;
                    doWifiSwitch = true;
                    server.send(200, "application/json", "{\"status\":\"ok\",\"msg\":\"Geçiş başlatıldı\"}");
                    return;
                }
            }
        }
    }
    server.send(400, "application/json", "{\"status\":\"error\",\"msg\":\"Ağ bulunamadı\"}");
}

void handleWifiAdd() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
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
            return;
        }
    }
    server.send(400, "application/json", "{\"status\":\"error\"}");
}

void handleWifiRemove() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
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
    setStatusLed(false);

    if (STM32_RST_PIN >= 0) {
        pinMode(STM32_RST_PIN, OUTPUT);
        digitalWrite(STM32_RST_PIN, HIGH);
    }

    // 1. Kayıtlı Ağları NVS'den Yükle
    loadSavedNetworks();
    loadProgrammerSettings();
    loadKnownTargets();

    // 2. Ağ Alt Yapısını Başlat (AP + STA Eşzamanlı)
    initNetworkSubsystem();
    initDiscoveryService();

    // 3. Web Sunucu Rotaları
    server.enableCORS(true);
    server.on("/", HTTP_GET, handleRoot);
    server.on("/ping", HTTP_GET, []() {
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.sendHeader("Cache-Control", "no-cache");
        server.send(200, "application/json", "{\"status\":\"ok\",\"uptime\":" + String(millis() / 1000) + "}");
    });

    server.on("/upload", HTTP_POST, []() {}, handleFileUpload);
    server.on("/stream-flash", HTTP_GET, handleStreamFlash);

    // Wi-Fi Yönetim API Rotaları
    server.on("/api/wifi/status", HTTP_GET, handleWifiStatus);
    server.on("/api/wifi/scan", HTTP_GET, handleWifiScan);
    server.on("/api/wifi/switch", HTTP_POST, handleWifiSwitch);
    server.on("/api/wifi/add", HTTP_POST, handleWifiAdd);
    server.on("/api/wifi/remove", HTTP_POST, handleWifiRemove);
    server.on("/api/programmer/status", HTTP_GET, handleProgrammerStatus);
    server.on("/api/programmer/settings", HTTP_POST, handleProgrammerSettings);
    server.on("/api/target/status", HTTP_GET, handleTargetStatus);
    server.on("/api/target/label", HTTP_POST, handleTargetLabel);
    server.on("/api/target/flash-usage", HTTP_GET, handleTargetFlashUsage);
    server.on("/stream-target-flash-usage", HTTP_GET, handleStreamTargetFlashUsage);
    server.on("/api/diagnostic/report", HTTP_GET, handleDiagnosticReport);

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
    handleDiscoveryService();

    // Dinamik Ağ Geçiş Durum Makinesi
    if (doWifiSwitch) {
        doWifiSwitch = false;
        Serial.printf("\n[WI-FI] '%s' ağına geçiş yapılıyor...\n", targetSwitchSsid.c_str());
        WiFi.disconnect(false, false);
        delay(50);
        WiFi.begin(targetSwitchSsid.c_str(), targetSwitchPass.c_str());

        unsigned long t0 = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - t0 < 5000) {
            delay(100);
            if (apModeActive) dnsServer.processNextRequest();
            server.handleClient();
        }

        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("[WI-FI] '%s' ağına BAĞLANDI! Yerel IP: %s\n", targetSwitchSsid.c_str(), WiFi.localIP().toString().c_str());
            MDNS.end();
            if (MDNS.begin("stardrop")) {
                MDNS.addService("http", "tcp", 80);
                Serial.println("[mDNS] http://stardrop.local AKTİF!");
            }
        } else {
            Serial.println("[WI-FI] Ağ geçişi zaman aşımına uğradı!");
        }
    }

    // Otomatik Wi-Fi Yeniden Bağlanma (Arka planda kesintisiz izleme)
    static unsigned long lastStaCheck = 0;
    if (millis() - lastStaCheck > 12000) {
        lastStaCheck = millis();
        if (WiFi.status() != WL_CONNECTED && !savedNetworks.empty() && !doWifiSwitch) {
            for (const auto& net : savedNetworks) {
                WiFi.begin(net.ssid.c_str(), net.password.c_str());
                unsigned long t0 = millis();
                while (WiFi.status() != WL_CONNECTED && millis() - t0 < 2500) {
                    delay(100);
                    if (apModeActive) dnsServer.processNextRequest();
                    server.handleClient();
                }
                if (WiFi.status() == WL_CONNECTED) {
                    Serial.printf("[WI-FI] Otomatik Yeniden BAĞLANDI! IP: %s\n", WiFi.localIP().toString().c_str());
                    MDNS.end();
                    if (MDNS.begin("stardrop")) {
                        MDNS.addService("http", "tcp", 80);
                    }
                    break;
                }
            }
        }
    }
}
