#pragma once
#include <stdint.h>
typedef struct { unsigned unused; } I2C_HandleTypeDef;
typedef enum { HAL_OK = 0, HAL_ERROR = 1, HAL_BUSY = 2, HAL_TIMEOUT = 3 } HAL_StatusTypeDef;
void HAL_Delay(uint32_t ms);
