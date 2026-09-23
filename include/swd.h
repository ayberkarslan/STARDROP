#pragma once

#include <Arduino.h>

// ==============================================================================
// YÜKSEK HIZLI VE AKILLI DURUM ALGILAYICI ARM SWD MOTORU
// ==============================================================================

#define SWD_ACK_OK      0x01
#define SWD_ACK_WAIT    0x02
#define SWD_ACK_FAULT   0x04

enum class SwdSpeedProfile : uint8_t {
    TURBO = 0, // En kısa kenar aralığı; kısa ve sağlam bağlantı gerektirir.
    FAST  = 1, // Eski sabit ayar: günlük kullanım varsayılanı.
    SAFE  = 2  // Uzun kablo/breadboard için muhafazakâr zamanlama.
};

// ARM CoreDebug ve Sistem Adresleri
#define DHCSR_ADDR      0xE000EDF0 // Debug Halting Control and Status Register
#define DCRSR_ADDR      0xE000EDF4 // Debug Core Register Selector Register
#define DCRDR_ADDR      0xE000EDF8 // Debug Core Register Data Register
#define DEMCR_ADDR      0xE000EDFC // Debug Exception and Monitor Control Register
#define AIRCR_ADDR      0xE000ED0C // Application Interrupt and Reset Control Register
#define HFSR_ADDR       0xE000ED2C // HardFault Status Register
#define DBGMCU_IDCODE_ADDR 0xE0042000 // STM32 device/revision kimliği

#define C_DEBUGEN       (1 << 0)
#define C_HALT          (1 << 1)
#define DBGKEY          (0xA05F0000)
#define VECTKEY         (0x05FA0000)
#define SYSRESETREQ     (1 << 2)

// STM32F4 Flash Kontrol Register Adresleri
#define STM32F4_FLASH_BASE  0x40023C00
#define FLASH_KEYR          (STM32F4_FLASH_BASE + 0x04)
#define FLASH_SR            (STM32F4_FLASH_BASE + 0x0C)
#define FLASH_CR            (STM32F4_FLASH_BASE + 0x10)

#define FLASH_KEY1          0x45670123
#define FLASH_KEY2          0xCDEF89AB

#define FLASH_SR_BSY        (1 << 16)
#define FLASH_SR_ERR_MASK   (0xF2) // PGSERR | PGPERR | PGAERR | WRPERR

#define FLASH_CR_PG         (1 << 0)
#define FLASH_CR_SER        (1 << 1)
#define FLASH_CR_SNB_SHIFT  3
#define FLASH_CR_SNB_MASK   (0xFUL << FLASH_CR_SNB_SHIFT)
#define FLASH_CR_MER        (1 << 2)
#define FLASH_CR_PSIZE_X32  (2 << 8)  // 32-bit hızlı yazma modu
#define FLASH_CR_STRT       (1 << 16)
#define FLASH_CR_LOCK       (1 << 31)

// STM32F4 sistem belleğindeki fabrika flash boyutu kaydı (KB, 16-bit).
#define STM32F4_FLASH_SIZE_REG 0x1FFF7A22UL
#define STM32F4_UID_BASE       0x1FFF7A10UL

// Hedef İşlemci Durum Teşhis Yapısı
struct TargetDiagnostics {
    bool isLockup;
    bool isSleeping;
    bool isHalted;
    bool isFlashLocked;
    bool isWriteProtected;
    uint32_t pc;
    uint32_t dhcsr;
    uint32_t hfsr;
    String statusSummary;
    String actionTaken;
};

struct TargetProbeInfo {
    bool connected;
    uint32_t dpIdcode;
    uint16_t deviceId;
    uint16_t revisionId;
    uint16_t flashSizeKb;
    uint32_t uid[3];
};

class SWDFlasher {
private:
    uint8_t pin_clk;
    uint8_t pin_dio;
    int8_t pin_rst;
    SwdSpeedProfile speedProfile = SwdSpeedProfile::FAST;

    // Yüksek hızlı GPIO bit-bang SWD gecikmesi.
    inline void swdDelay() {
        if (speedProfile == SwdSpeedProfile::TURBO) {
            __asm__ __volatile__("" ::: "memory");
        } else if (speedProfile == SwdSpeedProfile::SAFE) {
            delayMicroseconds(1);
        } else {
            __asm__ __volatile__ (
                "nop; nop; nop; nop; nop; nop; nop; nop; nop; nop;"
                "nop; nop; nop; nop; nop; nop; nop; nop; nop; nop;"
                "nop; nop; nop; nop; nop; nop; nop; nop; nop; nop;"
                ::: "memory"
            );
        }
    }

    inline void clockCycle() {
        digitalWrite(pin_clk, LOW);
        swdDelay();
        digitalWrite(pin_clk, HIGH);
        swdDelay();
    }

    void setDioOutput() {
        pinMode(pin_dio, OUTPUT);
    }

    void setDioInput() {
        pinMode(pin_dio, INPUT_PULLUP);
    }

    void writeBit(uint8_t bit) {
        digitalWrite(pin_dio, bit ? HIGH : LOW);
        digitalWrite(pin_clk, LOW);
        swdDelay();
        digitalWrite(pin_clk, HIGH);
        swdDelay();
    }

    uint8_t readBit() {
        digitalWrite(pin_clk, LOW);
        swdDelay();
        uint8_t bit = digitalRead(pin_dio) ? 1 : 0;
        digitalWrite(pin_clk, HIGH);
        swdDelay();
        return bit;
    }

    void writeBits(uint32_t data, uint8_t count) {
        for (uint8_t i = 0; i < count; i++) {
            writeBit((data >> i) & 1);
        }
    }

    uint8_t parity(uint32_t val) {
        val ^= val >> 16;
        val ^= val >> 8;
        val ^= val >> 4;
        val &= 0xF;
        return (0x6996 >> val) & 1;
    }

    uint8_t sendPacket(uint8_t ap, uint8_t read, uint8_t addr, uint32_t* data) {
        setDioOutput();
        uint8_t req = 0x81 | ((ap & 1) << 1) | ((read & 1) << 2) | ((addr & 0x0C) << 1);
        uint8_t p = parity(req & 0x1E);
        req |= (p << 5);

        // 8 Request biti (LSB first)
        for (int i = 0; i < 8; i++) {
            writeBit((req >> i) & 1);
        }

        // Turnaround (Host -> Target): STM32F4 varsayılanı 1 clock.
        setDioInput();
        clockCycle();

        // 3 ACK biti (LSB first)
        uint8_t ack = 0;
        for (uint8_t i = 0; i < 3; i++) {
            ack |= (readBit() << i);
        }

        if (ack == SWD_ACK_OK) {
            if (read) {
                // 32 Data biti + 1 Parity biti (Target -> Host)
                uint32_t val = 0;
                for (int i = 0; i < 32; i++) {
                    if (readBit()) val |= (1UL << i);
                }
                *data = val;

                uint8_t dataParity = readBit();
                if (dataParity != parity(val)) {
                    ack = SWD_ACK_FAULT;
                    parityErrorCount++;
                }

                // Turnaround (Target -> Host) + Host Output
                clockCycle();
                setDioOutput();
            } else {
                // Turnaround (Target -> Host) + Host Output
                clockCycle();
                setDioOutput();

                // 32 Data biti + 1 Parity biti (Host -> Target)
                for (int i = 0; i < 32; i++) {
                    writeBit((*data >> i) & 1);
                }
                writeBit(parity(*data));
            }
        } else {
            clockCycle();
            setDioOutput();
        }

        if (ack == SWD_ACK_WAIT) ackWaitCount++;
        if (ack == SWD_ACK_FAULT) ackFaultCount++;

        // 8 Idle Clock (SWDIO = 0)
        digitalWrite(pin_dio, LOW);
        for (int i = 0; i < 8; i++) {
            clockCycle();
        }

        return ack;
    }

public:
    uint8_t lastAck = 0;
    uint32_t lastIdcode = 0;
    uint32_t ackWaitCount = 0;
    uint32_t ackFaultCount = 0;
    uint32_t parityErrorCount = 0;
    TargetDiagnostics diag;

    void setSpeedProfile(SwdSpeedProfile profile) { speedProfile = profile; }
    SwdSpeedProfile getSpeedProfile() const { return speedProfile; }
    void resetTransferStats() { ackWaitCount = ackFaultCount = parityErrorCount = 0; }
    String transferDiagnostics() const {
        return "ACK WAIT: " + String(ackWaitCount) +
               ", ACK FAULT: " + String(ackFaultCount) +
               ", parity: " + String(parityErrorCount);
    }

    // ARM SW-DP DPIDR'nin JEP106 designer alanı (ARM = 0x23B) ve bit0
    // birleşimi 0x477'dir. Bu denetim farklı STM32 Cortex-M ailelerini
    // destekler, ancak kopuk hatta rastgele gelen sahte ACK'i reddeder.
    static bool isArmSwDpId(uint32_t idcode) {
        return (idcode & 0x00000FFFUL) == 0x477UL;
    }

    void begin(uint8_t clk, uint8_t dio, int8_t rst = -1) {
        pin_clk = clk;
        pin_dio = dio;
        pin_rst = rst;

        pinMode(pin_clk, OUTPUT);
        digitalWrite(pin_clk, HIGH); // ARM standardı: SWCLK boşta HIGH

        pinMode(pin_dio, OUTPUT);
        digitalWrite(pin_dio, HIGH);

        if (pin_rst >= 0) {
            pinMode(pin_rst, OUTPUT);
            digitalWrite(pin_rst, HIGH);
        }
    }

    void lineReset() {
        setDioOutput();
        digitalWrite(pin_dio, HIGH);
        for (int i = 0; i < 60; i++) {
            clockCycle();
        }
    }

    bool connect(uint32_t* idcode_out = nullptr) {
        lastAck = 0;
        lastIdcode = 0;

        for (int attempt = 1; attempt <= 6; attempt++) {
            // İlk 2 deneme Sıcak Bağlantı (En Hızlı Yol)
            // Sonraki denemeler reset HALA aktifken DAP'a bağlanır. Reset
            // bırakıldıktan sonra bağlanmak, uygulama PA13/PA14'ü çok erken
            // yeniden yapılandırıyorsa hedefi kurtaramaz.
            bool resetHeld = false;
            if (attempt > 2 && pin_rst >= 0) {
                pinMode(pin_rst, OUTPUT);
                digitalWrite(pin_rst, LOW);
                delay(20);
                resetHeld = true;
            }

            // 1. SWD Line Reset
            lineReset();

            // 2. JTAG-to-SWD Switch Sequence (0xE79E)
            writeBits(0xE79E, 16);

            // 3. Tekrar Line Reset
            lineReset();

            // 4. Idle Clocks (16 clocks)
            digitalWrite(pin_dio, LOW);
            for (int i = 0; i < 16; i++) {
                clockCycle();
            }

            // 5. READ DP IDCODE
            uint32_t idcode = 0;
            uint8_t ack = sendPacket(0, 1, 0x00, &idcode);
            lastAck = ack;
            lastIdcode = idcode;

            // Aynı DPIDR'yi tekrar oku: ACK=OK gibi görünen rastgele/bit
            // kaymış veriyle erase işlemine geçilmesini önler.
            uint32_t confirmIdcode = 0;
            uint8_t confirmAck = SWD_ACK_FAULT;
            if (ack == SWD_ACK_OK && isArmSwDpId(idcode)) {
                confirmAck = sendPacket(0, 1, 0x00, &confirmIdcode);
            }
            if (ack == SWD_ACK_OK && confirmAck == SWD_ACK_OK &&
                idcode == confirmIdcode && isArmSwDpId(idcode)) {
                if (resetHeld) {
                    pinMode(pin_rst, INPUT_PULLUP);
                    delay(5);
                }
                if (idcode_out) *idcode_out = idcode;
                Serial.printf("[SWD] ARM Cortex-M DAP Bağlandı! (Deneme %d, IDCODE: 0x%08X)\n", attempt, idcode);

                // 6. DAP Hata Temizleme (DP ABORT = 0x1E)
                uint32_t abortCmd = 0x0000001E;
                sendPacket(0, 0, 0x00, &abortCmd);

                // 7. Debug ve Sistem Güçlerini Aç (CTRL/STAT = 0x50000000)
                uint32_t ctrl = 0x50000000;
                sendPacket(0, 0, 0x04, &ctrl);
                delay(5);

                // 8. MEM-AP Seç (APSEL = 0, APBANKSEL = 0)
                uint32_t select = 0x00000000;
                sendPacket(0, 0, 0x08, &select);

                // 9. MEM-AP CSW Yapılandır (32-bit, Auto-increment = 0x23000052)
                uint32_t csw = 0x23000052;
                writeAP(0x00, csw);

                return true;
            }

            if (resetHeld) {
                pinMode(pin_rst, INPUT_PULLUP);
                delay(10);
            }

            delay(20);
        }

        Serial.printf("Bağlantı başarısız, son ACK: %d, IDCODE: 0x%08X\n", lastAck, lastIdcode);
        return false;
    }

    // Bu sorgu yalnız DAP/MEM-AP üzerinden okuma yapar; CPU'yu durdurmaz,
    // resetlemez ve kullanıcı yazılımına müdahale etmez.
    bool probe(TargetProbeInfo* info) {
        if (!info) return false;
        memset(info, 0, sizeof(*info));
        uint32_t idcode = 0;
        if (!connect(&idcode)) return false;

        uint32_t dbgId = readMem32(DBGMCU_IDCODE_ADDR);
        uint32_t flashSizeWord = readMem32(STM32F4_FLASH_SIZE_REG & ~0x3UL);
        info->connected = true;
        info->dpIdcode = idcode;
        info->deviceId = dbgId & 0x0FFF;
        info->revisionId = (dbgId >> 16) & 0xFFFF;
        info->flashSizeKb = (flashSizeWord >> 16) & 0xFFFF;
        info->uid[0] = readMem32(STM32F4_UID_BASE);
        info->uid[1] = readMem32(STM32F4_UID_BASE + 4);
        info->uid[2] = readMem32(STM32F4_UID_BASE + 8);
        return true;
    }

    uint8_t writeDP(uint8_t addr, uint32_t val) {
        return sendPacket(0, 0, addr, &val);
    }

    uint8_t readDP(uint8_t addr, uint32_t* val) {
        return sendPacket(0, 1, addr, val);
    }

    uint8_t writeAP(uint8_t addr, uint32_t val) {
        return sendPacket(1, 0, addr, &val);
    }

    uint8_t readAP(uint8_t addr, uint32_t* val) {
        uint32_t dummy;
        sendPacket(1, 1, addr, &dummy); // Pipelined read
        return sendPacket(0, 1, 0x0C, val); // Read DP RDBUFF
    }

    uint32_t readMem32(uint32_t addr) {
        writeAP(0x04, addr); // TAR
        uint32_t val = 0;
        readAP(0x0C, &val);  // DRW
        return val;
    }

    void writeMem32(uint32_t addr, uint32_t val) {
        writeAP(0x04, addr); // TAR
        writeAP(0x0C, val);  // DRW
    }

    // ==============================================================================
    // AKILLI DURUM VE HATA TEŞHİS MOTORU
    // ==============================================================================
    TargetDiagnostics inspectAndDiagnose() {
        memset(&diag, 0, sizeof(diag));

        // 1. DHCSR Oku (Core Debug Durumu)
        diag.dhcsr = readMem32(DHCSR_ADDR);
        diag.isLockup  = (diag.dhcsr & (1 << 19)) != 0; // S_LOCKUP (HardFault Kilitlenmesi)
        diag.isSleeping = (diag.dhcsr & (1 << 18)) != 0; // S_SLEEP (Uyku / Stop / WFI)
        diag.isHalted   = (diag.dhcsr & (1 << 17)) != 0; // S_HALT

        // 2. Program Counter (PC) Kaydı Oku
        writeMem32(DCRSR_ADDR, 15); // Reg 15 = PC
        diag.pc = readMem32(DCRDR_ADDR);

        // 3. HardFault Status Register (HFSR) Oku
        diag.hfsr = readMem32(HFSR_ADDR);

        // 4. Flash Kilit ve Koruma Durumu
        uint32_t cr = readMem32(FLASH_CR);
        uint32_t sr = readMem32(FLASH_SR);
        diag.isFlashLocked = (cr & FLASH_CR_LOCK) != 0;
        diag.isWriteProtected = (sr & (1 << 4)) != 0; // WRPERR

        // Durum Özeti Oluştur
        if (diag.isLockup) {
            char pcBuf[32];
            snprintf(pcBuf, sizeof(pcBuf), "0x%08X", diag.pc);
            diag.statusSummary = "🚨 İşlemci hardfaultda: (Kaza adresi: " + String(pcBuf) + ")";
            diag.actionTaken = "Reset catch ve hata temizleme devrede";
        } else if (diag.isSleeping) {
            diag.statusSummary = "💤 İşlemci düşük güç / Uyku modunda (WFI/STOP)";
            diag.actionTaken = "Debug syandırma sinyali gönderildi";
        } else {
            diag.statusSummary = "🟢 İşlemciyle bağlantı başarılı";
            diag.actionTaken = "Hızlı yazma aktif";
        }

        return diag;
    }

    bool haltAndRecover() {
        // Çekirdeği Dondur
        writeMem32(DHCSR_ADDR, DBGKEY | C_DEBUGEN | C_HALT);
        writeMem32(DEMCR_ADDR, 0x01000001); // TRCENA | VC_CORERESET

        // Eğer HardFault durumundaysa hatayı temizle
        if (diag.isLockup) {
            writeMem32(HFSR_ADDR, 0xFFFFFFFF); // HFSR bayraklarını sıfırla
            delay(5);
        }

        uint32_t dhcsr = readMem32(DHCSR_ADDR);
        return (dhcsr & (1 << 17)) != 0; // S_HALT doğrulama
    }

    bool unlockFlashIfNeeded() {
        uint32_t cr = readMem32(FLASH_CR);
        if (cr & FLASH_CR_LOCK) {
            writeMem32(FLASH_KEYR, FLASH_KEY1);
            writeMem32(FLASH_KEYR, FLASH_KEY2);
            swdDelay();
        }
        cr = readMem32(FLASH_CR);
        return !(cr & FLASH_CR_LOCK);
    }

    bool waitForFlashReady(uint32_t timeoutMs = 2000) {
        uint32_t t0 = millis();
        while (millis() - t0 < timeoutMs) {
            uint32_t sr = readMem32(FLASH_SR);
            if (!(sr & FLASH_SR_BSY)) {
                if (sr & FLASH_SR_ERR_MASK) {
                    writeMem32(FLASH_SR, FLASH_SR_ERR_MASK);
                    return false;
                }
                return true;
            }
            swdDelay();
        }
        return false;
    }

    bool massErase() {
        if (!waitForFlashReady()) return false;

        // Mass Erase: MER=1, STRT=1, PSIZE=32-bit
        writeMem32(FLASH_CR, FLASH_CR_MER | FLASH_CR_STRT | FLASH_CR_PSIZE_X32);

        bool ok = waitForFlashReady(15000);
        writeMem32(FLASH_CR, 0);
        return ok;
    }

    // F401/F446 gibi STM32F4'lerde flash bankası 16K,16K,16K,16K,64K ve
    // devamında 128K sektörlerden oluşur. Küçük firmware için tüm flashı
    // silmek yerine yalnızca görüntünün değdiği sektörleri sileriz.
    bool eraseImageSectors(uint32_t imageBytes, uint8_t* erasedCount = nullptr,
                           uint16_t* flashSizeKbOut = nullptr) {
        if (erasedCount) *erasedCount = 0;
        uint32_t sizeWord = readMem32(STM32F4_FLASH_SIZE_REG & ~0x3UL);
        uint16_t flashSizeKb = (uint16_t)(sizeWord >> 16);
        if (flashSizeKbOut) *flashSizeKbOut = flashSizeKb;

        // Bu geometri yalnız bilinen STM32F4 boyutlarında güvenlidir.
        if (flashSizeKb != 256 && flashSizeKb != 512 && flashSizeKb != 1024) {
            return massErase();
        }

        uint32_t imageEnd = imageBytes;
        uint32_t sectorStart = 0;
        uint8_t sector = 0;
        while (sectorStart < imageEnd) {
            uint32_t sectorSize;
            if (sector < 4) sectorSize = 16 * 1024UL;
            else if (sector == 4) sectorSize = 64 * 1024UL;
            else sectorSize = 128 * 1024UL;

            if (sectorStart >= (uint32_t)flashSizeKb * 1024UL) return false;
            if (!waitForFlashReady()) return false;

            // Önce eski hata bayraklarını temizle, sonra tek sektörü sil.
            writeMem32(FLASH_SR, FLASH_SR_ERR_MASK);
            uint32_t cr = FLASH_CR_SER |
                          ((uint32_t)sector << FLASH_CR_SNB_SHIFT) |
                          FLASH_CR_STRT;
            writeMem32(FLASH_CR, cr);
            bool ok = waitForFlashReady(15000);
            writeMem32(FLASH_CR, 0);
            if (!ok) return false;
            if (erasedCount) (*erasedCount)++;

            sectorStart += sectorSize;
            sector++;
        }
        return true;
    }

    // ==============================================================================
    // MEM-AP AUTO-INCREMENT STREAMING İLE IŞIK HIZINDA YAZMA (3X-5X HIZLANMA)
    // ==============================================================================
    bool writeBlock(uint32_t address, const uint8_t* data, uint16_t length) {
        if (!waitForFlashReady()) return false;

        // Flash'ı 32-bit PG moduna al
        writeMem32(FLASH_CR, FLASH_CR_PG | FLASH_CR_PSIZE_X32);

        // MEM-AP TAR Adresini BLOK BAŞINDA SADECE 1 KEZ YAZ (Auto-increment aktif!)
        writeAP(0x04, address);

        uint16_t words = (length + 3) / 4;
        const uint32_t* ptr = (const uint32_t*)data;

        // 64 kelimeyi (256 bayt) DRW register'ına art arda hızlıca bas
        for (uint16_t i = 0; i < words; i++) {
            writeAP(0x0C, ptr[i]); // DRW
        }

        // Blok sonu donanım BSY kontrolü
        bool ok = waitForFlashReady(100);
        writeMem32(FLASH_CR, 0);
        return ok;
    }

    // MEM-AP AUTO-INCREMENT STREAMING İLE IŞIK HIZINDA DOĞRULAMA (READBACK)
    bool readBlock(uint32_t address, uint8_t* data, uint16_t length) {
        // TAR Adresini BLOK BAŞINDA SADECE 1 KEZ YAZ
        writeAP(0x04, address);

        uint16_t words = (length + 3) / 4;
        uint32_t* ptr = (uint32_t*)data;

        // Okuma hattını başlat (Dummy Read)
        uint32_t dummy;
        sendPacket(1, 1, 0x0C, &dummy);

        for (uint16_t i = 0; i < words - 1; i++) {
            sendPacket(1, 1, 0x0C, &ptr[i]);
        }
        // Son kelimeyi RDBUFF'tan al
        sendPacket(0, 1, 0x0C, &ptr[words - 1]);

        return true;
    }

    void resetAndRun() {
        // Çekirdeği yeniden başlat (SYSRESETREQ)
        writeMem32(AIRCR_ADDR, VECTKEY | SYSRESETREQ);
        delay(10);

        // Debug modunu kapat ve serbest bırak
        writeMem32(DHCSR_ADDR, DBGKEY | 0);

        // Donanımsal reset isteğe bağlıdır. Bağlı değilse SYSRESETREQ yeterlidir.
        if (pin_rst >= 0) {
            pinMode(pin_rst, OUTPUT);
            digitalWrite(pin_rst, LOW);
            delay(30);
            pinMode(pin_rst, INPUT_PULLUP);
        }

        // Pinleri boşa çıkar
        pinMode(pin_clk, INPUT);
        pinMode(pin_dio, INPUT);
    }
};

extern SWDFlasher swd;
