#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* ABI v1: little endian, float32, snapshot only; host rejects odd/changing seq. */
#define STARDROP_TELEMETRY_ADDRESS 0x20000200UL
#define STARDROP_TELEMETRY_MAGIC 0x53544c4dUL
#define STARDROP_TELEMETRY_CHANNELS 8U
typedef struct {
    char name[24];
    char unit[12];
    float value;
    uint32_t valid;
} stardrop_channel_t;
typedef struct {
    uint32_t magic, version, size, sequence;
    uint32_t timestamp_ms, sample_counter, status, channel_count;
    uint32_t test_id_hash, profile_hash, run_hash;
    stardrop_channel_t channels[STARDROP_TELEMETRY_CHANNELS];
    uint32_t crc32;
} stardrop_telemetry_t;
extern volatile stardrop_telemetry_t stardrop_telemetry;
void stardrop_telemetry_init(void);
void stardrop_telemetry_publish(uint32_t timestamp, uint32_t count, uint32_t status, const stardrop_channel_t *channels, uint32_t length);
#ifdef __cplusplus
}
static_assert(sizeof(stardrop_telemetry_t) == 400, "telemetry ABI changed");
#else
_Static_assert(sizeof(stardrop_telemetry_t) == 400, "telemetry ABI changed");
#endif
