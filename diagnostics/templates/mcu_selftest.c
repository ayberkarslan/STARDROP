#include "diagnostic_test.h"
#include "generated_config.h"

/* No sensor or extra wires: prove this firmware executed on the expected
 * STM32 family and can write/read its own SRAM before reporting over SWD. */
static volatile uint32_t scratch[32];

int diagnostic_run(diagnostic_result_t *result) {
    const uint32_t device_id = (*(volatile uint32_t *)0xE0042000UL) & 0x0FFFUL;
    result->observed_id = device_id;
#if STARDROP_F401
    result->expected_id = 0x423;
    if (device_id != 0x423 && device_id != 0x433) {
#else
    result->expected_id = 0x421;
    if (device_id != 0x421) {
#endif
        result->error = STARDROP_ERROR_ID_MISMATCH;
        return 0;
    }
    result->expected_id = device_id; /* F401 0x423 and 0x433 are both accepted. */
    uint32_t checksum = 0;
    for (uint32_t index = 0; index < 32; ++index) scratch[index] = 0xA55A0000UL ^ (index * 0x10201UL);
    for (uint32_t index = 0; index < 32; ++index) {
        const uint32_t expected = 0xA55A0000UL ^ (index * 0x10201UL);
        if (scratch[index] != expected) {
            result->error = STARDROP_ERROR_INTERNAL;
            result->detail_code = index;
            return 0;
        }
        checksum ^= scratch[index];
    }
    result->detail_code = checksum;
    return 1;
}
