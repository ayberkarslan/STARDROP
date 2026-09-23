#pragma once

#include <stdint.h>

#define STARDROP_REPORT_MAGIC 0x53545250UL /* STRP */
#define STARDROP_REPORT_ABI_VERSION 1U
#define STARDROP_REPORT_ADDRESS 0x20000100UL
#define STARDROP_REPORT_SIZE 128U

typedef enum {
    STARDROP_REPORT_IDLE = 0,
    STARDROP_REPORT_RUNNING = 1,
    STARDROP_REPORT_PASS = 2,
    STARDROP_REPORT_FAIL = 3,
    STARDROP_REPORT_FATAL = 4,
} stardrop_report_state_t;

typedef enum {
    STARDROP_ERROR_NONE = 0,
    STARDROP_ERROR_BUS_TIMEOUT = 1,
    STARDROP_ERROR_DEVICE_NOT_FOUND = 2,
    STARDROP_ERROR_ID_MISMATCH = 3,
    STARDROP_ERROR_MEASUREMENT_RANGE = 4,
    STARDROP_ERROR_CONFIGURATION = 5,
    STARDROP_ERROR_INTERNAL = 255,
} stardrop_error_t;

/*
 * Both sequence values must match and crc32 must verify before a host accepts
 * the report. This keeps SWD readers from consuming a report mid-write.
 */
typedef struct __attribute__((packed, aligned(4))) {
    uint32_t magic;
    uint16_t abi_version;
    uint16_t size;
    uint32_t sequence_start;
    uint32_t state;
    uint32_t error;
    uint32_t test_id_hash;
    uint32_t profile_hash;
    uint32_t expected_device_id;
    uint32_t observed_device_id;
    int32_t primary_measurement_milli;
    int32_t secondary_measurement_milli;
    uint32_t elapsed_ms;
    uint32_t detail_code;
    uint8_t reserved[68];
    uint32_t crc32;
    uint32_t sequence_end;
} stardrop_diagnostic_report_t;

_Static_assert(sizeof(stardrop_diagnostic_report_t) == STARDROP_REPORT_SIZE, "report ABI size changed");

uint32_t stardrop_report_crc32(const stardrop_diagnostic_report_t* report);
void stardrop_report_begin_at(volatile stardrop_diagnostic_report_t* report, uint32_t test_id_hash, uint32_t profile_hash);
void stardrop_report_finish_at(volatile stardrop_diagnostic_report_t* report, stardrop_report_state_t state, stardrop_error_t error);
int stardrop_report_is_valid(const stardrop_diagnostic_report_t* report);

static inline volatile stardrop_diagnostic_report_t* stardrop_report_at_fixed_address(void) {
    return (volatile stardrop_diagnostic_report_t*)STARDROP_REPORT_ADDRESS;
}
