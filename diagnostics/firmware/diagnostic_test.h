#pragma once
#include <stdint.h>
#include "stardrop_diagnostic_report.h"

/* All sensor tests implement this interface. Board-specific pins live in generated_config.h. */
typedef struct {
    uint32_t expected_id;
    uint32_t observed_id;
    int32_t primary_milli;
    int32_t secondary_milli;
    uint32_t detail_code;
    stardrop_error_t error;
} diagnostic_result_t;

int diagnostic_run(diagnostic_result_t *result);
int i2c_write(uint8_t address, const uint8_t *bytes, uint32_t length);
int i2c_read(uint8_t address, uint8_t *bytes, uint32_t length);
int i2c_read_register(uint8_t address, uint8_t reg, uint8_t *bytes, uint32_t length);
void delay_ms(uint32_t milliseconds);
