#pragma once
#include <stdint.h>
typedef struct { unsigned unused; } I2C_HandleTypeDef;
typedef enum { HAL_OK = 0, HAL_ERROR = 1 } HAL_StatusTypeDef;
#define __DMB() __sync_synchronize()
#ifdef __cplusplus
extern "C" {
#endif
void HAL_Delay(uint32_t ms);
#ifdef __cplusplus
}
#endif
