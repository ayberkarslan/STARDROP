#include "diagnostic_test.h"
#include "generated_config.h"

void platform_i2c_init(void);

int main(void) {
    volatile stardrop_diagnostic_report_t *report = stardrop_report_at_fixed_address();
    stardrop_report_begin_at(report, STARDROP_TEST_ID_HASH, STARDROP_PROFILE_HASH);
    platform_i2c_init();
    diagnostic_result_t result = {0};
    int passed = diagnostic_run(&result);
    report->expected_device_id = result.expected_id;
    report->observed_device_id = result.observed_id;
    report->primary_measurement_milli = result.primary_milli;
    report->secondary_measurement_milli = result.secondary_milli;
    report->detail_code = result.detail_code;
    stardrop_report_finish_at(report, passed ? STARDROP_REPORT_PASS : STARDROP_REPORT_FAIL,
                              passed ? STARDROP_ERROR_NONE : result.error);
    for (;;) { __asm__ volatile ("wfi"); }
}
