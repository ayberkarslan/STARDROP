#include "diagnostic_test.h"

/* BMP180 contract: verify chip ID 0x55, then read an uncompensated temperature
 * sample. The raw ADC code is detail_code, never mislabeled as degrees C. */
int diagnostic_run(diagnostic_result_t *result) {
    const uint8_t address = 0x77;
    const uint8_t command[] = { 0xF4, 0x2E };
    uint8_t id = 0;
    result->expected_id = 0x55;
    if (!i2c_read_register(address, 0xD0, &id, 1)) {
        result->error = STARDROP_ERROR_DEVICE_NOT_FOUND;
        return 0;
    }
    result->observed_id = id;
    if (id != 0x55) { result->error = STARDROP_ERROR_ID_MISMATCH; return 0; }
    if (!i2c_write(address, command, sizeof(command))) {
        result->error = STARDROP_ERROR_BUS_TIMEOUT;
        return 0;
    }
    delay_ms(6);
    uint8_t raw[2] = {0};
    if (!i2c_read_register(address, 0xF6, raw, sizeof(raw))) {
        result->error = STARDROP_ERROR_BUS_TIMEOUT;
        return 0;
    }
    result->detail_code = ((uint32_t)raw[0] << 8) | raw[1];
    if (result->detail_code == 0 || result->detail_code == 0xFFFF) {
        result->error = STARDROP_ERROR_MEASUREMENT_RANGE;
        return 0;
    }
    return 1;
}
