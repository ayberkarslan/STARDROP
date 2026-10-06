#include "stardrop_telemetry.h"
#include "stm32f4xx_hal.h"
#include <string.h>
volatile stardrop_telemetry_t stardrop_telemetry __attribute__((section(".stardrop_telemetry"), aligned(4), used));
void stardrop_telemetry_init(void) {
    memset((void *)&stardrop_telemetry, 0, sizeof(stardrop_telemetry));
    stardrop_telemetry.version = 1;
    stardrop_telemetry.size = sizeof(stardrop_telemetry);
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
    __DMB(); stardrop_telemetry.sequence++;
}
