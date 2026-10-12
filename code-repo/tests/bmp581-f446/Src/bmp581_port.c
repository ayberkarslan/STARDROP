#include "bmp581_port.h"
#include <math.h>
#include <string.h>

static BMP5_INTF_RET_TYPE read_regs(uint8_t reg, uint8_t *data, uint32_t size, void *context) {
    stardrop_bmp581_t *sensor = context;
    if (!data || !size || size > 32) return -1;
    sensor->last_bus_status = stardrop_i2c_read(sensor->bus, (uint16_t)sensor->address << 1, reg, data, (uint16_t)size);
    return sensor->last_bus_status == HAL_OK ? BMP5_INTF_RET_SUCCESS : -1;
}
static BMP5_INTF_RET_TYPE write_regs(uint8_t reg, const uint8_t *data, uint32_t size, void *context) {
    stardrop_bmp581_t *sensor = context;
    if (!data || !size || size > 32) return -1;
    // The Bosch API writes sequential registers; the shared bus supports one
    // register per transfer, including on software-I2C pin pairs.
    for (uint32_t i = 0; i < size; ++i) {
        sensor->last_bus_status = stardrop_i2c_write(sensor->bus, (uint16_t)sensor->address << 1, (uint8_t)(reg + i), data[i]);
        if (sensor->last_bus_status != HAL_OK) return -1;
    }
    return BMP5_INTF_RET_SUCCESS;
}
static void delay_us(uint32_t us, void *context) {
    (void)context;
    // Rounded up: never shorten the vendor's reset/settling delays.
    HAL_Delay((us + 999U) / 1000U);
}
int8_t stardrop_bmp581_init(stardrop_bmp581_t *sensor, I2C_HandleTypeDef *bus) {
    memset(sensor, 0, sizeof(*sensor));
    sensor->bus = bus;
    sensor->device.intf = BMP5_I2C_INTF;
    sensor->device.intf_ptr = sensor;
    sensor->device.read = read_regs;
    sensor->device.write = write_regs;
    sensor->device.delay_us = delay_us;
    HAL_Delay(10);
    // Do not send configuration/reset commands to an unidentified device.
    const uint8_t addresses[] = { BMP5_I2C_ADDR_PRIM, BMP5_I2C_ADDR_SEC };
    int8_t result = BMP5_E_COM_FAIL;
    for (unsigned i = 0; i < sizeof(addresses); ++i) {
        sensor->address = addresses[i];
        if (read_regs(BMP5_REG_CHIP_ID, &sensor->chip_id, 1, sensor) != BMP5_INTF_RET_SUCCESS) continue;
        if (sensor->chip_id != BMP5_CHIP_ID_PRIM) { result = BMP5_E_INVALID_CHIP_ID; continue; }
        result = bmp5_init(&sensor->device);
        if (result != BMP5_OK) return result;
        result = bmp5_soft_reset(&sensor->device);
        if (result != BMP5_OK) return result;
        result = bmp5_set_power_mode(BMP5_POWERMODE_STANDBY, &sensor->device);
        if (result != BMP5_OK) return result;
        result = bmp5_get_osr_odr_press_config(&sensor->config, &sensor->device);
        if (result != BMP5_OK) return result;
        sensor->config.press_en = BMP5_ENABLE;
        sensor->config.osr_p = BMP5_OVERSAMPLING_4X;
        sensor->config.osr_t = BMP5_OVERSAMPLING_1X;
        sensor->config.odr = BMP5_ODR_10_HZ;
        result = bmp5_set_osr_odr_press_config(&sensor->config, &sensor->device);
        if (result != BMP5_OK) return result;
        struct bmp5_int_source_select interrupts = {0}; interrupts.drdy_en = BMP5_ENABLE;
        result = bmp5_int_source_select(&interrupts, &sensor->device);
        if (result != BMP5_OK) return result;
        return bmp5_set_power_mode(BMP5_POWERMODE_NORMAL, &sensor->device);
    }
    return result;
}
int8_t stardrop_bmp581_read(stardrop_bmp581_t *sensor, float *pressure, float *temperature) {
    uint8_t status = 0;
    int8_t result = bmp5_get_interrupt_status(&status, &sensor->device);
    if (result != BMP5_OK) return result;
    if (!(status & BMP5_INT_ASSERTED_DRDY)) return STARDROP_BMP581_WAITING;
    struct bmp5_sensor_data data = {0};
    result = bmp5_get_sensor_data(&data, &sensor->config, &sensor->device);
    if (result != BMP5_OK) return result;
    if (!isfinite(data.pressure) || !isfinite(data.temperature) || data.pressure < 30000.0f || data.pressure > 125000.0f
        || data.temperature < -40.0f || data.temperature > 85.0f) return STARDROP_BMP581_RANGE_ERROR;
    *pressure = data.pressure; *temperature = data.temperature;
    return BMP5_OK;
}
