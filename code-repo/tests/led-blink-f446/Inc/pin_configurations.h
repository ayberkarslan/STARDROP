#ifndef STARDROP_PIN_CONFIGURATIONS_H
#define STARDROP_PIN_CONFIGURATIONS_H

/* Local default: Nucleo F446RE user LED. Workbench generates this header
 * in its temporary build directory; the source project stays unchanged. */
#define STARDROP_PIN_SCHEMA_VERSION 1
#define STARDROP_LED_GPIO_PORT GPIOA
#define STARDROP_LED_GPIO_PIN GPIO_PIN_5
#define STARDROP_LED_GPIO_CLK_ENABLE() __HAL_RCC_GPIOA_CLK_ENABLE()
#define STARDROP_LED_ACTIVE_LOW 0
#define STARDROP_LED_BLINK_MS 100
#define STARDROP_LED_SERIAL_ENABLED 0

#if STARDROP_LED_BLINK_MS < 50 || STARDROP_LED_BLINK_MS > 5000
#error "LED interval must be between 50 and 5000 ms"
#endif

#endif
