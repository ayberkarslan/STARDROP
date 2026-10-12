#include "main.h"
#include "pin_configurations.h"
#include "sensor_config.h"
#include "bmp581_port.h"
#include "stardrop_telemetry.h"
#include "stardrop_diagnostic_report.h"
#include <math.h>
#include <stdbool.h>

// C globals retain simple ELF names for Live Expressions. On error the old
// sample remains available, but sensor_status=2 and telemetry validity=0.
volatile float pressure_pa = NAN;
volatile float temperature_c = NAN;
volatile uint32_t sample_counter = 0;
volatile uint32_t last_sample_ms = 0;
volatile uint32_t sensor_status = 0; // 0 waiting, 1 valid, 2 error
volatile int32_t sensor_error = 0;   // Bosch API errors; -100 range; -101 no fresh data
volatile uint32_t sensor_i2c_address = 0;
volatile uint32_t sensor_chip_id = 0;
volatile uint32_t i2c_status = 0;    // HAL: 0 OK, 1 ERROR, 2 BUSY, 3 TIMEOUT
static I2C_HandleTypeDef bus;
static stardrop_bmp581_t sensor;

static void clock_init(void) {
    __HAL_RCC_PWR_CLK_ENABLE();
    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);
    RCC_OscInitTypeDef osc = {0};
    osc.OscillatorType = RCC_OSCILLATORTYPE_HSI; osc.HSIState = RCC_HSI_ON;
    osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT; osc.PLL.PLLState = RCC_PLL_NONE;
    if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();
    RCC_ClkInitTypeDef clock = {0};
    clock.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    clock.SYSCLKSource = RCC_SYSCLKSOURCE_HSI; clock.AHBCLKDivider = RCC_SYSCLK_DIV1;
    clock.APB1CLKDivider = RCC_HCLK_DIV1; clock.APB2CLKDivider = RCC_HCLK_DIV1;
    if (HAL_RCC_ClockConfig(&clock, FLASH_LATENCY_0) != HAL_OK) Error_Handler();
}
int main(void) {
    HAL_Init(); clock_init(); stardrop_telemetry_init();
    volatile stardrop_diagnostic_report_t *report = stardrop_report_at_fixed_address();
    stardrop_report_begin_at(report, STARDROP_TEST_ID_HASH, STARDROP_PROFILE_HASH);
    for (unsigned i = 0; i < 4; ++i) report->reserved[i] = (uint8_t)(STARDROP_RUN_HASH >> (8 * i));
    report->expected_device_id = BMP5_CHIP_ID_PRIM;
    i2c_status = stardrop_i2c_init(&bus);
    sensor_error = i2c_status == HAL_OK ? stardrop_bmp581_init(&sensor, &bus) : BMP5_E_COM_FAIL;
    sensor_i2c_address = sensor.address; sensor_chip_id = sensor.chip_id;
    if (i2c_status == HAL_OK) i2c_status = sensor.last_bus_status;
    bool ready = sensor_error == BMP5_OK, reported = false;
    uint32_t last_attempt = HAL_GetTick(), last_fresh = last_attempt;
    stardrop_channel_t channels[2] = {{"pressure", "Pa", 0, 0}, {"temperature", "degC", 0, 0}};
    if (!ready) sensor_status = 2;
    for (;;) {
        uint32_t now = HAL_GetTick();
        if ((uint32_t)(now - last_attempt) >= STARDROP_SAMPLE_INTERVAL_MS || (!reported && !ready)) {
            last_attempt = now;
            if (ready) {
                float pressure, temperature;
                int8_t result = stardrop_bmp581_read(&sensor, &pressure, &temperature);
                i2c_status = sensor.last_bus_status;
                if (result == BMP5_OK) {
                    pressure_pa = pressure; temperature_c = temperature;
                    sample_counter++; last_sample_ms = HAL_GetTick(); last_fresh = now;
                    sensor_status = 1; sensor_error = 0;
                } else if (result != STARDROP_BMP581_WAITING) { sensor_status = 2; sensor_error = result; }
                else if ((uint32_t)(now - last_fresh) >= STARDROP_BMP581_READY_TIMEOUT_MS) {
                    sensor_status = 2; sensor_error = STARDROP_BMP581_READY_TIMEOUT;
                }
            }
            channels[0].value = pressure_pa; channels[1].value = temperature_c;
            channels[0].valid = channels[1].valid = sensor_status == 1;
            stardrop_telemetry_publish(last_sample_ms, sample_counter, sensor_status, channels, 2);
            if (!reported && sensor_status != 0) {
                report->observed_device_id = sensor_chip_id;
                report->detail_code = (uint32_t)sensor_error;
                if (sensor_status == 1) {
                    report->primary_measurement_milli = (int32_t)(pressure_pa * 1000.0f);
                    report->secondary_measurement_milli = (int32_t)(temperature_c * 1000.0f);
                }
                report->elapsed_ms = HAL_GetTick();
                stardrop_error_t error = sensor_error == BMP5_E_COM_FAIL ? STARDROP_ERROR_BUS_TIMEOUT
                    : sensor_error == BMP5_E_INVALID_CHIP_ID ? STARDROP_ERROR_ID_MISMATCH
                    : sensor_error == STARDROP_BMP581_RANGE_ERROR ? STARDROP_ERROR_MEASUREMENT_RANGE : STARDROP_ERROR_CONFIGURATION;
                stardrop_report_finish_at(report, sensor_status == 1 ? STARDROP_REPORT_PASS : STARDROP_REPORT_FAIL,
                    sensor_status == 1 ? STARDROP_ERROR_NONE : error);
                reported = true;
            }
        }
        HAL_Delay(1);
    }
}
void Error_Handler(void) {
    sensor_status = 2; sensor_error = -102;
    __disable_irq(); for (;;) {}
}
