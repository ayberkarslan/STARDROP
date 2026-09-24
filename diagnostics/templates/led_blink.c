#include "diagnostic_test.h"
#include "generated_config.h"

#define GPIO_BASE(port) (0x40020000UL + ((uint32_t)(port) * 0x400UL))
#define REG32(address) (*(volatile uint32_t *)(address))

int diagnostic_run(diagnostic_result_t *result) {
    const uint32_t base = GPIO_BASE(STARDROP_LED_PORT);
    REG32(0x40023830UL) |= 1UL << STARDROP_LED_PORT;
    REG32(base) = (REG32(base) & ~(3UL << (STARDROP_LED_PIN * 2U))) | (1UL << (STARDROP_LED_PIN * 2U));
    REG32(base + 0x04UL) &= ~(1UL << STARDROP_LED_PIN);
    REG32(base + 0x08UL) &= ~(3UL << (STARDROP_LED_PIN * 2U));
    REG32(base + 0x18UL) = STARDROP_LED_ACTIVE_LOW ? 1UL << STARDROP_LED_PIN : 1UL << (STARDROP_LED_PIN + 16U);
    result->detail_code = STARDROP_BLINK_MS;
    return 1;
}

void diagnostic_idle(void) {
    const uint32_t base = GPIO_BASE(STARDROP_LED_PORT);
    REG32(base + 0x14UL) ^= 1UL << STARDROP_LED_PIN;
    delay_ms(STARDROP_BLINK_MS);
}
