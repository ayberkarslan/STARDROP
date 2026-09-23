#include <assert.h>
#include <string.h>
#include "stardrop_diagnostic_report.h"

int main(void) {
    stardrop_diagnostic_report_t report;
    memset(&report, 0xA5, sizeof(report));
    stardrop_report_begin_at(&report, 0xB180U, 0xF401U);
    assert(report.state == STARDROP_REPORT_RUNNING);
    assert(!stardrop_report_is_valid(&report));
    report.observed_device_id = 0x55U;
    report.primary_measurement_milli = 101325;
    stardrop_report_finish_at(&report, STARDROP_REPORT_PASS, STARDROP_ERROR_NONE);
    assert(stardrop_report_is_valid(&report));
    assert(report.state == STARDROP_REPORT_PASS);
    report.detail_code++;
    assert(!stardrop_report_is_valid(&report));
    return 0;
}
