#include "stardrop_diagnostic_report.h"

#include <string.h>

static uint32_t sequence_counter = 0;

uint32_t stardrop_report_crc32(const stardrop_diagnostic_report_t* report) {
    const uint8_t* bytes = (const uint8_t*)report;
    const uint32_t crc_offset = (uint32_t)((const uint8_t*)&report->crc32 - bytes);
    uint32_t crc = 0xFFFFFFFFUL;
    for (uint32_t index = 0; index < crc_offset; ++index) {
        crc ^= bytes[index];
        for (uint8_t bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ (0xEDB88320UL & (-(int32_t)(crc & 1U)));
    }
    return ~crc;
}

void stardrop_report_begin_at(volatile stardrop_diagnostic_report_t* report, uint32_t test_id_hash, uint32_t profile_hash) {
    stardrop_diagnostic_report_t clean = {0};
    const uint32_t sequence = ++sequence_counter;
    clean.magic = STARDROP_REPORT_MAGIC;
    clean.abi_version = STARDROP_REPORT_ABI_VERSION;
    clean.size = STARDROP_REPORT_SIZE;
    clean.sequence_start = sequence;
    clean.state = STARDROP_REPORT_RUNNING;
    clean.test_id_hash = test_id_hash;
    clean.profile_hash = profile_hash;
    memcpy((void*)report, &clean, sizeof(clean));
}

void stardrop_report_finish_at(volatile stardrop_diagnostic_report_t* report, stardrop_report_state_t state, stardrop_error_t error) {
    stardrop_diagnostic_report_t complete;
    memcpy(&complete, (const void*)report, sizeof(complete));
    complete.state = (uint32_t)state;
    complete.error = (uint32_t)error;
    complete.crc32 = stardrop_report_crc32(&complete);
    complete.sequence_end = complete.sequence_start;
    memcpy((void*)report, &complete, sizeof(complete));
}

int stardrop_report_is_valid(const stardrop_diagnostic_report_t* report) {
    return report && report->magic == STARDROP_REPORT_MAGIC &&
        report->abi_version == STARDROP_REPORT_ABI_VERSION &&
        report->size == STARDROP_REPORT_SIZE &&
        report->sequence_start != 0 && report->sequence_start == report->sequence_end &&
        report->crc32 == stardrop_report_crc32(report);
}
