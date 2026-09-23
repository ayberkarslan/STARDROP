#include "diagnostic_test.h"

/* Bus-presence diagnostic. It cannot prove a particular device identity. */
int diagnostic_run(diagnostic_result_t *result) {
    uint32_t count = 0;
    for (uint8_t address = 0x08; address < 0x78; ++address) {
        if (i2c_write(address, 0, 0)) {
            if (!count) result->observed_id = address;
            ++count;
        }
    }
    result->detail_code = count;
    result->error = count ? STARDROP_ERROR_NONE : STARDROP_ERROR_DEVICE_NOT_FOUND;
    return count > 0;
}
