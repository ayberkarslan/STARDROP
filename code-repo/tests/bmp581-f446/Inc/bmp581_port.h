#pragma once
#include "stardrop_i2c.h"
#include "bmp5.h"
#define STARDROP_BMP581_WAITING 1
#define STARDROP_BMP581_RANGE_ERROR (-100)
#define STARDROP_BMP581_READY_TIMEOUT (-101)
typedef struct {
    struct bmp5_dev device;
    struct bmp5_osr_odr_press_config config;
    I2C_HandleTypeDef *bus;
    uint8_t address;
    uint8_t chip_id;
    HAL_StatusTypeDef last_bus_status;
} stardrop_bmp581_t;
int8_t stardrop_bmp581_init(stardrop_bmp581_t *sensor, I2C_HandleTypeDef *bus);
int8_t stardrop_bmp581_read(stardrop_bmp581_t *sensor, float *pressure, float *temperature);
