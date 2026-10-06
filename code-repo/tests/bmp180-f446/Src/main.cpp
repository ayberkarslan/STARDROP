/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include "bmp180.h"
#include "pin_configurations.h"
#include "sensor_config.h"
#include "stardrop_i2c.h"
#include "stardrop_telemetry.h"
#include "stardrop_diagnostic_report.h"

/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
I2C_HandleTypeDef hi2c1;

/* USER CODE BEGIN PV */
volatile float temperature_c = 0;
volatile float pressure_pa = 0;
volatile uint32_t sample_counter = 0;
volatile uint32_t last_sample_ms = 0;
volatile uint32_t sensor_status = 0; // 0: hazır değil, 1: başarılı, 2: hata


/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  stardrop_telemetry_init();
  volatile auto *report = stardrop_report_at_fixed_address();
  stardrop_report_begin_at(report, STARDROP_TEST_ID_HASH, STARDROP_PROFILE_HASH);
  const uint32_t run = STARDROP_RUN_HASH;
  for (unsigned i = 0; i < 4; ++i) report->reserved[i] = (uint8_t)(run >> (8 * i));
  bool bus_ready = stardrop_i2c_init(&hi2c1) == HAL_OK;
  /* USER CODE BEGIN 2 */
  BMP180 bmp(&hi2c1);
  bool sensor_ready = bus_ready && bmp.init();
  if (sensor_ready) {
      sensor_status = 0; // hazır değil, henüz okuma yapılmadı
  } else {
      sensor_status = 2; // error
  }
  uint32_t last_attempt_ms = HAL_GetTick();
  bool first_result = false;
  stardrop_channel_t channels[2] = {{"temperature", "degC", 0, 0}, {"pressure", "Pa", 0, 0}};
  stardrop_telemetry_publish(0, 0, sensor_status, channels, 2);
  if (!sensor_ready) {
      report->expected_device_id = 0x55; report->observed_device_id = bmp.getChipId();
      stardrop_error_t error = !bus_ready || bmp.getError() == BMP180::Error::BUS ? STARDROP_ERROR_BUS_TIMEOUT
          : bmp.getError() == BMP180::Error::IDENTITY ? STARDROP_ERROR_ID_MISMATCH : STARDROP_ERROR_CONFIGURATION;
      stardrop_report_finish_at(report, STARDROP_REPORT_FAIL, error);
      first_result = true;
  }


  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
    uint32_t now = HAL_GetTick();
    if (now - last_attempt_ms >= STARDROP_SAMPLE_INTERVAL_MS) {
        last_attempt_ms = now;

        if (sensor_ready && bmp.read() == BMP180::Status::SUCCESS) {
            temperature_c = bmp.getTemperatureC();
            pressure_pa = bmp.getPressurePa();
            sensor_status = 1;
            sample_counter++;
            last_sample_ms = HAL_GetTick();
        } else {
            sensor_status = 2;
        }
        channels[0].value = temperature_c; channels[1].value = pressure_pa;
        channels[0].valid = channels[1].valid = sensor_status == 1;
        stardrop_telemetry_publish(last_sample_ms, sample_counter, sensor_status, channels, 2);
        if (!first_result) {
            report->expected_device_id = report->observed_device_id = 0x55;
            report->primary_measurement_milli = (int32_t)(temperature_c * 1000);
            report->secondary_measurement_milli = (int32_t)(pressure_pa * 1000);
            report->elapsed_ms = HAL_GetTick();
            stardrop_report_finish_at(report, sensor_status == 1 ? STARDROP_REPORT_PASS : STARDROP_REPORT_FAIL,
                sensor_status == 1 ? STARDROP_ERROR_NONE
                    : bmp.getError() == BMP180::Error::BUS ? STARDROP_ERROR_BUS_TIMEOUT : STARDROP_ERROR_MEASUREMENT_RANGE);
            first_result = true;
        }
    }
    HAL_Delay(1);

  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
