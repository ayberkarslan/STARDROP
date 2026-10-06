#pragma once
#include "stm32f4xx_hal.h"
#ifdef __cplusplus
extern "C" {
#endif
HAL_StatusTypeDef stardrop_i2c_init(I2C_HandleTypeDef *bus);
HAL_StatusTypeDef stardrop_i2c_read(I2C_HandleTypeDef *bus, uint16_t address, uint8_t reg, uint8_t *data, uint16_t size);
HAL_StatusTypeDef stardrop_i2c_write(I2C_HandleTypeDef *bus, uint16_t address, uint8_t reg, uint8_t value);
#ifdef __cplusplus
}
#endif
