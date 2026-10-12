#include "bmp581_port.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

static uint8_t regs[256], active_address;
static unsigned writes;
static int fail_bus;
void HAL_Delay(uint32_t ms) { (void)ms; }
HAL_StatusTypeDef stardrop_i2c_read(I2C_HandleTypeDef *bus, uint16_t address, uint8_t reg, uint8_t *data, uint16_t size) {
    (void)bus;
    if (fail_bus || address != (uint16_t)(active_address << 1)) return HAL_ERROR;
    memcpy(data, regs + reg, size);
    if (reg == BMP5_REG_INT_STATUS) regs[reg] = 0;
    return HAL_OK;
}
HAL_StatusTypeDef stardrop_i2c_write(I2C_HandleTypeDef *bus, uint16_t address, uint8_t reg, uint8_t value) {
    (void)bus;
    if (fail_bus || address != (uint16_t)(active_address << 1)) return HAL_ERROR;
    writes++;
    regs[reg] = value;
    if (reg == BMP5_REG_CMD && value == BMP5_SOFT_RESET_CMD) regs[BMP5_REG_INT_STATUS] = BMP5_INT_ASSERTED_POR_SOFTRESET_COMPLETE;
    return HAL_OK;
}
static void reset(uint8_t address, uint8_t chip) {
    memset(regs, 0, sizeof(regs)); active_address = address; writes = 0; fail_bus = 0;
    regs[BMP5_REG_CHIP_ID] = chip; regs[BMP5_REG_STATUS] = BMP5_INT_NVM_RDY;
}
static void value24(uint8_t reg, uint32_t value) {
    regs[reg] = value; regs[reg + 1] = value >> 8; regs[reg + 2] = value >> 16;
}
int main(void) {
    I2C_HandleTypeDef bus = {0}; stardrop_bmp581_t sensor;
    for (unsigned address = 0x46; address <= 0x47; ++address) {
        reset(address, 0x50);
        assert(stardrop_bmp581_init(&sensor, &bus) == BMP5_OK);
        assert(sensor.address == address && sensor.chip_id == 0x50);
        assert(sensor.config.press_en == BMP5_ENABLE);
        float pressure = -1, temperature = -1;
        assert(stardrop_bmp581_read(&sensor, &pressure, &temperature) == STARDROP_BMP581_WAITING);
        assert(pressure == -1);
        value24(BMP5_REG_PRESS_DATA_XLSB, 100000U * 64U);
        value24(BMP5_REG_TEMP_DATA_XLSB, (uint32_t)(-5 * 65536));
        regs[BMP5_REG_INT_STATUS] = BMP5_INT_ASSERTED_DRDY;
        assert(stardrop_bmp581_read(&sensor, &pressure, &temperature) == BMP5_OK);
        assert(fabsf(pressure - 100000.0f) < 0.01f && fabsf(temperature + 5.0f) < 0.01f);
        value24(BMP5_REG_PRESS_DATA_XLSB, 1000U * 64U);
        regs[BMP5_REG_INT_STATUS] = BMP5_INT_ASSERTED_DRDY;
        assert(stardrop_bmp581_read(&sensor, &pressure, &temperature) == STARDROP_BMP581_RANGE_ERROR);
        assert(pressure == 100000.0f);
        fail_bus = 1;
        assert(stardrop_bmp581_read(&sensor, &pressure, &temperature) == BMP5_E_COM_FAIL);
        assert(sensor.last_bus_status == HAL_ERROR);
    }
    reset(0x46, 0x55);
    assert(stardrop_bmp581_init(&sensor, &bus) == BMP5_E_INVALID_CHIP_ID); assert(writes == 0);
    reset(0x46, 0x50); regs[BMP5_REG_STATUS] = 0;
    assert(stardrop_bmp581_init(&sensor, &bus) == BMP5_E_NVM_NOT_READY); assert(writes == 0);
    reset(0x46, 0x50); fail_bus = 1;
    assert(stardrop_bmp581_init(&sensor, &bus) == BMP5_E_COM_FAIL); assert(writes == 0);
    puts("BMP581: real Bosch API, both addresses, units, negative temperature, identity, NVM, stale data and bus failures passed.");
}
