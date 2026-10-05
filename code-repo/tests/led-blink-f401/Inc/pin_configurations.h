#ifndef STARDROP_PIN_CONFIGURATIONS_H
#define STARDROP_PIN_CONFIGURATIONS_H

/* STARDROP pin schema v1. The workbench generates a header with these names.
 * Keep board wiring here; diagnostic logic must not contain GPIO numbers. */
#define STARDROP_PIN_SCHEMA_VERSION 1
#define STARDROP_LED_GPIO_PORT GPIOC
#define STARDROP_LED_GPIO_PIN GPIO_PIN_13
#define STARDROP_LED_GPIO_CLK_ENABLE() __HAL_RCC_GPIOC_CLK_ENABLE()
#define STARDROP_LED_ACTIVE_LOW 1
#define STARDROP_LED_BLINK_MS 100
#define STARDROP_LED_ON_MS 100
#define STARDROP_LED_OFF_MS 100
#define STARDROP_LED_SERIAL_ENABLED 0

/* Future single-device tests use semantic roles in the same format, e.g.
 * STARDROP_I2C_SCL_GPIO_PORT / _PIN / _CLK_ENABLE and corresponding SDA.
 * Each generated header contains only the roles required by its test. */

#endif /* STARDROP_PIN_CONFIGURATIONS_H */
