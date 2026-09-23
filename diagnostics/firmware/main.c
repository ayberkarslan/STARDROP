#include "diagnostic_test.h"
#include "generated_config.h"

void platform_i2c_init(void);
#define DEMCR (*(volatile unsigned int *)0xE000EDFCUL)
#define DWT_CTRL (*(volatile unsigned int *)0xE0001000UL)
#define DWT_CYCCNT (*(volatile unsigned int *)0xE0001004UL)

int main(void) {
    volatile stardrop_diagnostic_report_t *report = stardrop_report_at_fixed_address();
    stardrop_report_begin_at(report, STARDROP_TEST_ID_HASH, STARDROP_PROFILE_HASH);
#if STARDROP_USE_I2C
    platform_i2c_init();
#endif
    DEMCR |= 1UL << 24;
    DWT_CYCCNT = 0;
    DWT_CTRL |= 1UL;
    diagnostic_result_t result = {0};
    int passed = diagnostic_run(&result);
    report->elapsed_ms = DWT_CYCCNT / 16000UL;
    report->expected_device_id = result.expected_id;
    report->observed_device_id = result.observed_id;
    report->primary_measurement_milli = result.primary_milli;
    report->secondary_measurement_milli = result.secondary_milli;
    report->detail_code = result.detail_code;
    report->reserved[0] = (uint8_t)(STARDROP_RUN_HASH);
    report->reserved[1] = (uint8_t)(STARDROP_RUN_HASH >> 8);
    report->reserved[2] = (uint8_t)(STARDROP_RUN_HASH >> 16);
    report->reserved[3] = (uint8_t)(STARDROP_RUN_HASH >> 24);
    stardrop_report_finish_at(report, passed ? STARDROP_REPORT_PASS : STARDROP_REPORT_FAIL,
                              passed ? STARDROP_ERROR_NONE : result.error);
    for (;;) { __asm__ volatile ("wfi"); }
}
