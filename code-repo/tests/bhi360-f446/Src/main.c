#include "main.h"
#include "pin_configurations.h"
#include "sensor_config.h"
#include "stardrop_i2c.h"
#include "stardrop_diagnostic_report.h"

/* Inspect these in Live Expressions even when the diagnostic report fails. */
volatile uint32_t sensor_chip_id = 0;
volatile uint32_t sensor_status = 0; /* 0 pending, 1 detected, 2 error */
volatile int32_t sensor_error = 0; /* -1 bus init, -2 read/ACK, -3 wrong ID */
volatile uint32_t i2c_status = 0;

static void clock_init(void) {
    __HAL_RCC_PWR_CLK_ENABLE();
    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);
    RCC_OscInitTypeDef osc = {0};
    osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    osc.HSIState = RCC_HSI_ON;
    osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
    osc.PLL.PLLState = RCC_PLL_NONE;
    if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();
    RCC_ClkInitTypeDef clock = {0};
    clock.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    clock.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
    clock.AHBCLKDivider = RCC_SYSCLK_DIV1;
    clock.APB1CLKDivider = RCC_HCLK_DIV1;
    clock.APB2CLKDivider = RCC_HCLK_DIV1;
    if (HAL_RCC_ClockConfig(&clock, FLASH_LATENCY_0) != HAL_OK) Error_Handler();
}

int main(void) {
    HAL_Init();
    clock_init();
    volatile stardrop_diagnostic_report_t *report = stardrop_report_at_fixed_address();
    stardrop_report_begin_at(report, STARDROP_TEST_ID_HASH, STARDROP_PROFILE_HASH);
    for (unsigned i = 0; i < 4; ++i) report->reserved[i] = (uint8_t)(STARDROP_RUN_HASH >> (8 * i));
    report->expected_device_id = STARDROP_BHI360_PRODUCT_ID;

    I2C_HandleTypeDef bus = {0};
    i2c_status = stardrop_i2c_init(&bus);
    if (i2c_status != HAL_OK) sensor_error = -1;
    else {
        uint8_t id = 0;
        i2c_status = stardrop_i2c_read(&bus, STARDROP_BHI360_ADDRESS,
            STARDROP_BHI360_PRODUCT_REGISTER, &id, 1);
        sensor_chip_id = id;
        sensor_error = i2c_status != HAL_OK ? -2 : id != STARDROP_BHI360_PRODUCT_ID ? -3 : 0;
    }
    sensor_status = sensor_error == 0 ? 1 : 2;
    report->observed_device_id = sensor_chip_id;
    report->detail_code = (uint32_t)sensor_error;
    report->elapsed_ms = HAL_GetTick();
    stardrop_error_t error = sensor_error == -1 ? STARDROP_ERROR_CONFIGURATION
        : sensor_error == -2 ? STARDROP_ERROR_BUS_TIMEOUT
        : sensor_error == -3 ? STARDROP_ERROR_ID_MISMATCH : STARDROP_ERROR_NONE;
    stardrop_report_finish_at(report, sensor_status == 1 ? STARDROP_REPORT_PASS : STARDROP_REPORT_FAIL, error);
    for (;;) HAL_Delay(1000);
}

void Error_Handler(void) {
    sensor_status = 2;
    sensor_error = -4;
    __disable_irq();
    for (;;) {}
}
