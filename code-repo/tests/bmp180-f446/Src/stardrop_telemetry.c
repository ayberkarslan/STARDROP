#include "stardrop_telemetry.h"
#include "stm32f4xx_hal.h"
#include "pin_configurations.h"
#include <string.h>
#include <stddef.h>
static uint32_t crc32(const stardrop_telemetry_t *frame) {
    const uint8_t *bytes = (const uint8_t *)frame;
    uint32_t crc = 0xffffffffU;
    for (uint32_t i = 0; i < offsetof(stardrop_telemetry_t, crc32); ++i) {
        crc ^= bytes[i];
        for (unsigned bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ (0xedb88320U & (0U - (crc & 1U)));
    }
    return ~crc;
}
volatile stardrop_telemetry_t stardrop_telemetry __attribute__((section(".stardrop_telemetry"), aligned(4), used));
void stardrop_telemetry_init(void) {
    memset((void *)&stardrop_telemetry, 0, sizeof(stardrop_telemetry));
    stardrop_telemetry.version = 1;
    stardrop_telemetry.size = sizeof(stardrop_telemetry);
    stardrop_telemetry.test_id_hash = STARDROP_TEST_ID_HASH;
    stardrop_telemetry.profile_hash = STARDROP_PROFILE_HASH;
    stardrop_telemetry.run_hash = STARDROP_RUN_HASH;
    __DMB(); stardrop_telemetry.magic = STARDROP_TELEMETRY_MAGIC;
}
void stardrop_telemetry_publish(uint32_t timestamp, uint32_t count, uint32_t status, const stardrop_channel_t *channels, uint32_t length) {
    if (length > STARDROP_TELEMETRY_CHANNELS || (length && !channels)) return;
    stardrop_telemetry.sequence++; __DMB();
    stardrop_telemetry.timestamp_ms = timestamp;
    stardrop_telemetry.sample_counter = count;
    stardrop_telemetry.status = status;
    stardrop_telemetry.channel_count = length;
    for (uint32_t i = 0; i < length; ++i) {
        memcpy((void *)&stardrop_telemetry.channels[i], &channels[i], sizeof(channels[i]));
        stardrop_telemetry.channels[i].name[23] = 0;
        stardrop_telemetry.channels[i].unit[11] = 0;
    }
    stardrop_telemetry_t complete;
    memcpy(&complete, (const void *)&stardrop_telemetry, sizeof(complete));
    complete.sequence++;
    stardrop_telemetry.crc32 = crc32(&complete);
    __DMB(); stardrop_telemetry.sequence = complete.sequence;
}
