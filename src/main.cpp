#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <vector>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "web_page.h"

// ==============================================================================
// 1. HOTSPOT (ACCESS POINT) AYARLARI
// ==============================================================================
const char* AP_SSID       = "YRT-OTA";    // Wi-Fi Ağ Adı
const char* AP_PASSWORD   = "12345678";   // Wi-Fi Şifresi
const byte  DNS_PORT      = 53;

// ==============================================================================
// 2. PIN TANIMLAMALARI (ESP32-C3 Super Mini -> STM32 Nucleo-F446RE)
// ==============================================================================
// ESP32-C3 Super Mini üzerindeki donanımsal doğrudan UART pinleri:
#define STM32_RX_PIN      20   // ESP32-C3 RX (Kartın sol altındaki 'RX' pini ➔ STM32 PA9 TX'e)
#define STM32_TX_PIN      21   // ESP32-C3 TX (Kartın sol altındaki 'TX' pini ➔ STM32 PA10 RX'e)
#define STM32_BOOT0_PIN   4    // ESP32-C3 GPIO 4 (Kartın sağındaki 'D2' pini ➔ STM32 BOOT0'a)
#define STM32_RST_PIN     3    // ESP32-C3 GPIO 3 (Kartın sağındaki 'D1' pini ➔ STM32 NRST'ye)
#define ONBOARD_LED_PIN   8    // ESP32-C3 Super Mini üzerindeki Mavi LED (GPIO 8)

// ==============================================================================
// 3. ST BOOTLOADER PROTOKOL SABİTLERİ (AN3155)
// ==============================================================================
#define STM32_ACK         0x79 // Başarılı yanıt baytı
#define STM32_NACK        0x1F // Hata/Red yanıt baytı
#define STM32_CMD_INIT    0x7F // Autobaud senkronizasyon baytı
#define STM32_CMD_READ    0x11 // Read Memory komutu
#define STM32_CMD_WRITE   0x31 // Write Memory komutu
#define STM32_CMD_ERASE   0x44 // Extended Flash Erase komutu
#define FLASH_START_ADDR  0x08000000 // STM32F4 Flash başlangıç adresi

// Donanım Nesneleri
HardwareSerial STM32_Serial(1);
WebServer server(80);
DNSServer dnsServer;

// Gelen dosyanın RAM tamponu
std::vector<uint8_t> firmwareBuffer;

// ==============================================================================
// 4. STM32 DAHİLİ BOOTLOADER İLETİŞİM FONKSİYONLARI (UART)
// ==============================================================================

bool waitForAck(uint32_t timeoutMs = 2000) {
    uint32_t start = millis();
    while (millis() - start < timeoutMs) {
        if (STM32_Serial.available()) {
            uint8_t res = STM32_Serial.read();
            if (res == STM32_ACK) return true;
            if (res == STM32_NACK) return false;
        }
        delay(1);
    }
    return false;
}

String lastDiagnosticMsg = "";

bool stm32EnterBootloader() {
    // 1. BOOT0 = HIGH (System ROM'dan başlaması için)
    pinMode(STM32_BOOT0_PIN, OUTPUT);
    digitalWrite(STM32_BOOT0_PIN, HIGH);
    delay(50);

    // 2. Open-Drain Reset Emülasyonu (Nucleo ST-Link ile çakışmayı önler)
    pinMode(STM32_RST_PIN, OUTPUT);
    digitalWrite(STM32_RST_PIN, LOW); // 0V'a çek
    delay(150);
    pinMode(STM32_RST_PIN, INPUT_PULLUP); // Bırak ve 3.3V'a yükselmesini bekle
    delay(250);

    // 3. UART 8E1 Başlat
    STM32_Serial.begin(115200, SERIAL_8E1, STM32_RX_PIN, STM32_TX_PIN);
    while (STM32_Serial.available()) STM32_Serial.read();

    // 4. 0x7F Gönder ve Gelen Yanıtı Dinle
    for (int attempt = 1; attempt <= 6; attempt++) {
        while (STM32_Serial.available()) STM32_Serial.read();
        STM32_Serial.write(STM32_CMD_INIT);

        uint32_t t0 = millis();
        while (millis() - t0 < 300) {
            if (STM32_Serial.available()) {
                uint8_t b = STM32_Serial.read();
                if (b == STM32_ACK) {
                    lastDiagnosticMsg = "0x79 ACK alındı";
                    return true;
                } else if (b == STM32_NACK) {
                    lastDiagnosticMsg = "0x1F NACK alındı";
                } else {
                    char hexb[16];
                    snprintf(hexb, sizeof(hexb), "0x%02X alındı", b);
                    lastDiagnosticMsg = String(hexb);
                }
            }
            delay(1);
        }
        delay(100);
    }
    return false;
}

bool stm32EraseFlash() {
    STM32_Serial.write(STM32_CMD_ERASE);
    STM32_Serial.write(0xBB); // 0x44 ^ 0xFF
    if (!waitForAck(2000)) return false;

    // Mass Erase: 0xFFFF, Checksum: 0x00
    STM32_Serial.write(0xFF);
    STM32_Serial.write(0xFF);
    STM32_Serial.write(0x00);

    return waitForAck(15000); // Mass Erase süresi
}

bool stm32WriteChunk(uint32_t address, uint8_t* data, uint16_t length) {
    STM32_Serial.write(STM32_CMD_WRITE);
    STM32_Serial.write(0xCE); // 0x31 ^ 0xFF
    if (!waitForAck()) return false;

    uint8_t addrBytes[4];
    addrBytes[0] = (address >> 24) & 0xFF;
    addrBytes[1] = (address >> 16) & 0xFF;
    addrBytes[2] = (address >> 8)  & 0xFF;
    addrBytes[3] = address & 0xFF;
    uint8_t addrChecksum = addrBytes[0] ^ addrBytes[1] ^ addrBytes[2] ^ addrBytes[3];

    STM32_Serial.write(addrBytes, 4);
    STM32_Serial.write(addrChecksum);
    if (!waitForAck()) return false;

    uint8_t lenByte = (uint8_t)(length - 1);
    uint8_t dataChecksum = lenByte;

    STM32_Serial.write(lenByte);
    for (uint16_t i = 0; i < length; i++) {
        STM32_Serial.write(data[i]);
        dataChecksum ^= data[i];
    }
    STM32_Serial.write(dataChecksum);

    return waitForAck(3000);
}

/**
 * UART üzerinden STM32 Flash'ından 256 baytı geri okur (0x11 Read Memory)
 * ve gönderilen orijinal veri ile bayt bayt karşılaştırır.
 */
bool stm32VerifyChunk(uint32_t address, uint8_t* expectedData, uint16_t length) {
    STM32_Serial.write(STM32_CMD_READ);
    STM32_Serial.write(0xEE); // 0x11 ^ 0xFF
    if (!waitForAck()) return false;

    uint8_t addrBytes[4];
    addrBytes[0] = (address >> 24) & 0xFF;
    addrBytes[1] = (address >> 16) & 0xFF;
    addrBytes[2] = (address >> 8)  & 0xFF;
    addrBytes[3] = address & 0xFF;
    uint8_t addrChecksum = addrBytes[0] ^ addrBytes[1] ^ addrBytes[2] ^ addrBytes[3];

    STM32_Serial.write(addrBytes, 4);
    STM32_Serial.write(addrChecksum);
    if (!waitForAck()) return false;

    uint8_t lenByte = (uint8_t)(length - 1);
    STM32_Serial.write(lenByte);
    STM32_Serial.write((uint8_t)~lenByte);
    if (!waitForAck()) return false;

    for (uint16_t i = 0; i < length; i++) {
        uint32_t t0 = millis();
        while (!STM32_Serial.available()) {
            if (millis() - t0 > 1000) return false;
        }
        uint8_t readByte = STM32_Serial.read();
        if (readByte != expectedData[i]) {
            Serial.printf("[DOĞRULAMA HATASI] Adres: 0x%08X (Giden: 0x%02X != Gelen: 0x%02X)\n", 
                          address + i, expectedData[i], readByte);
            return false;
        }
    }
    return true;
}

void stm32ExitBootloader() {
    // 1. BOOT0 pinini kesin olarak 0V yap ve hattın tamamen boşalmasını bekle
    pinMode(STM32_BOOT0_PIN, OUTPUT);
    digitalWrite(STM32_BOOT0_PIN, LOW);
    delay(100);

    // 2. Open-Drain Reset darbesi: NRST hattını 150ms boyunca 0V'a çek
    pinMode(STM32_RST_PIN, OUTPUT);
    digitalWrite(STM32_RST_PIN, LOW);
    delay(150);

    // 3. Reset hattını serbest bırak (Nucleo'nun 3.3V pull-up direnci çeksin)
    pinMode(STM32_RST_PIN, INPUT_PULLUP);
    delay(150);

    // 4. UART pinlerini serbest bırak (STM32'nin ana programı pinleri serbestçe kullansın)
    STM32_Serial.end();
    pinMode(STM32_RX_PIN, INPUT);
    pinMode(STM32_TX_PIN, INPUT);
}

// ==============================================================================
// 5. WEB SUNUCUSU VE CANLI SERİ PORT / SSE AKIŞI
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
    server.sendHeader("Pragma", "no-cache");
    server.sendHeader("Expires", "-1");
    server.send_P(200, "text/html", INDEX_HTML);
}

void handleNotFound() {
    String host = server.hostHeader();
    if (!isIp(host) && host.indexOf("192.168.4.1") == -1) {
        server.sendHeader("Location", "http://192.168.4.1/", true);
        server.send(302, "text/plain", "");
        return;
    }
    handleRoot();
}

// 1. Adım: Dosyayı alıp RAM tamponuna yazan handler
void handleFileUpload() {
    HTTPUpload& upload = server.upload();

    if (upload.status == UPLOAD_FILE_START) {
        firmwareBuffer.clear();
        firmwareBuffer.reserve(65536);
        Serial.printf("\n[WEB] Dosya alımı başladı: %s\n", upload.filename.c_str());
    } else if (upload.status == UPLOAD_FILE_WRITE) {
        firmwareBuffer.insert(firmwareBuffer.end(), upload.buf, upload.buf + upload.currentSize);
    } else if (upload.status == UPLOAD_FILE_END) {
        Serial.printf("[WEB] Dosya RAM tamponuna alındı: %u bayt\n", (uint32_t)firmwareBuffer.size());
        server.send(200, "application/json", "{\"status\":\"ok\",\"size\":" + String(firmwareBuffer.size()) + "}");
    }
}

// Tarayıcıdaki terminale canlı log gönderen yardımcı fonksiyon (SSE)
void sendSSE(const String& msg, const String& type = "info", int pct = -1, const String& chunks = "") {
    String json = "data: {\"msg\":\"" + msg + "\",\"type\":\"" + type + "\"";
    if (pct >= 0) json += ",\"pct\":" + String(pct);
    if (chunks.length() > 0) json += ",\"chunks\":\"" + chunks + "\"";
    json += "}\n\n";
    server.sendContent(json);
    Serial.println(msg);
}

// 2. Adım: Canlı Terminal & Flash Akış Handler'ı (Server-Sent Events)
void handleStreamFlash() {
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "text/event-stream", "");

    if (firmwareBuffer.empty()) {
        sendSSE("HATA: Yüklenecek firmware dosyası bulunamadı!", "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }

    uint32_t totalBytes = firmwareBuffer.size();
    uint32_t totalChunks = (totalBytes + 255) / 256;

    sendSSE("[1/4] STM32 Bootloader başlatılıyor (BOOT0=1, NRST tetiklendi)...", "info", 5);
    if (!stm32EnterBootloader()) {
        String errDetail = "[HATA] STM32 Bootloader el sıkışma (0x7F) başarısız!";
        if (lastDiagnosticMsg.length() > 0) {
            errDetail += " [Detay: " + lastDiagnosticMsg + "]";
        } else {
            errDetail += " [Detay: UART hattı tamamen sessiz, STM32'den hiçbir veri gelmedi]";
        }
        sendSSE(errDetail, "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }
    sendSSE("[OK] STM32 Dahili ROM Bootloader bağlandı (0x79 ACK alındı).", "success", 12);

    sendSSE("[2/4] Flash belleği siliniyor (0x44 Extended Mass Erase)...", "info", 15);
    if (!stm32EraseFlash()) {
        sendSSE("[HATA] Flash silme işlemi başarısız oldu!", "error");
        server.sendContent("data: {\"error\":true}\n\n");
        return;
    }
    sendSSE("[OK] Flash tamamen silindi. Yazma ve doğrulama başlıyor...", "success", 20);

    uint32_t currentAddr = FLASH_START_ADDR;
    uint8_t chunk[256];

    for (uint32_t i = 0; i < totalChunks; i++) {
        uint32_t offset = i * 256;
        memset(chunk, 0xFF, 256);

        if (offset + 256 > totalBytes) {
            memcpy(chunk, &firmwareBuffer[offset], totalBytes - offset);
        } else {
            memcpy(chunk, &firmwareBuffer[offset], 256);
        }

        // 1. Bloğu Yaz (STM32 XOR checksum ile doğrular)
        if (!stm32WriteChunk(currentAddr, chunk, 256)) {
            char buf[64];
            snprintf(buf, sizeof(buf), "[HATA] 0x%08X yazma reddedildi (NACK)!", currentAddr);
            sendSSE(String(buf), "error");
            server.sendContent("data: {\"error\":true}\n\n");
            return;
        }

        // 2. Bloğu UART'tan Geri Oku ve Bayt Bayt Doğrula (0x11 Read Memory)
        if (!stm32VerifyChunk(currentAddr, chunk, 256)) {
            char buf[64];
            snprintf(buf, sizeof(buf), "[DOĞRULAMA HATASI] 0x%08X Flash verisi uyuşmadı!", currentAddr);
            sendSSE(String(buf), "error");
            server.sendContent("data: {\"error\":true}\n\n");
            return;
        }

        int pct = 20 + ((i + 1) * 78) / totalChunks;
        char hexAddr[16];
        snprintf(hexAddr, sizeof(hexAddr), "0x%08X", currentAddr);
        String chunkInfo = String(i + 1) + " / " + String(totalChunks) + " Blok";

        sendSSE("[UART] " + String(hexAddr) + " ➔ 256B Yazıldı + Doğrulandı (OK)", "chunk", pct, chunkInfo);
        currentAddr += 256;
    }

    sendSSE("[4/4] STM32 Normal Çalışma Moduna geçiriliyor (BOOT0=0, Reset)...", "info", 99);
    stm32ExitBootloader();

    char successMsg[80];
    snprintf(successMsg, sizeof(successMsg), "[TAMAMLANDI] Toplam %u bayt (%u blok) hatasız yazıldı ve çalışıyor!", totalBytes, totalChunks);
    sendSSE(String(successMsg), "success", 100);

    server.sendContent("data: {\"done\":true}\n\n");
}

// ==============================================================================
// 6. SETUP & LOOP
// ==============================================================================

void setup() {
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

    Serial.begin(115200);
    delay(1000);
    Serial.println("\n==============================================");
    Serial.println("  ESP32-C3 Super Mini -> STM32 OTA Hotspot    ");
    Serial.println("==============================================");

    pinMode(ONBOARD_LED_PIN, OUTPUT);
    digitalWrite(ONBOARD_LED_PIN, LOW); // LED Açık

    pinMode(STM32_BOOT0_PIN, OUTPUT);
    pinMode(STM32_RST_PIN, OUTPUT);
    digitalWrite(STM32_BOOT0_PIN, LOW);
    digitalWrite(STM32_RST_PIN, HIGH);

    WiFi.mode(WIFI_AP);
    WiFi.setSleep(false);

    IPAddress local_ip(192, 168, 4, 1);
    IPAddress gateway(192, 168, 4, 1);
    IPAddress subnet(255, 255, 255, 0);
    WiFi.softAPConfig(local_ip, gateway, subnet);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    WiFi.setTxPower(WIFI_POWER_11dBm);

    dnsServer.start(DNS_PORT, "*", local_ip);

    Serial.println("[OK] Hotspot Aktif!");
    Serial.printf("SSID: %s | Şifre: %s\n", AP_SSID, AP_PASSWORD);
    Serial.printf("Web: http://%s\n", WiFi.softAPIP().toString().c_str());

    // Web Sunucu Rotaları
    server.on("/", HTTP_GET, handleRoot);
    server.on("/ping", HTTP_GET, []() {
        server.sendHeader("Cache-Control", "no-cache");
        server.send(200, "application/json", "{\"status\":\"ok\",\"uptime\":" + String(millis() / 1000) + "}");
    });
    server.on("/upload", HTTP_POST, []() {}, handleFileUpload);
    server.on("/stream-flash", HTTP_GET, handleStreamFlash);

    // Captive portal yönlendirmeleri
    server.on("/generate_204", HTTP_GET, handleNotFound);
    server.on("/gen_204", HTTP_GET, handleNotFound);
    server.on("/hotspot-detect.html", HTTP_GET, handleNotFound);
    server.on("/connecttest.txt", HTTP_GET, handleNotFound);
    server.on("/ncsi.txt", HTTP_GET, handleNotFound);
    server.on("/favicon.ico", HTTP_GET, []() { server.send(204, "text/plain", ""); });
    server.onNotFound(handleNotFound);

    server.begin();
    Serial.println("[OK] Web Sunucusu Hazır.");
}

void loop() {
    dnsServer.processNextRequest();
    server.handleClient();
}
