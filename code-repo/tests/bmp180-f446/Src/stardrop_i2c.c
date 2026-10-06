#include "stardrop_i2c.h"
#include "pin_configurations.h"
#include "sensor_config.h"

#if STARDROP_I2C_BUS_SOFTWARE
/* No SysTick reconfiguration: HAL conversion delays must remain operational. */
static uint32_t deadline;
static void pause_bus(void) {
    uint32_t start = DWT->CYCCNT;
    uint32_t cycles = SystemCoreClock / 200000U;
    while ((uint32_t)(DWT->CYCCNT - start) < cycles) { __NOP(); }
}
static void scl(int high) { HAL_GPIO_WritePin(STARDROP_I2C_SCL_GPIO_PORT, STARDROP_I2C_SCL_GPIO_PIN, high ? GPIO_PIN_SET : GPIO_PIN_RESET); }
static void sda(int high) { HAL_GPIO_WritePin(STARDROP_I2C_SDA_GPIO_PORT, STARDROP_I2C_SDA_GPIO_PIN, high ? GPIO_PIN_SET : GPIO_PIN_RESET); }
static int sda_high(void) { return HAL_GPIO_ReadPin(STARDROP_I2C_SDA_GPIO_PORT, STARDROP_I2C_SDA_GPIO_PIN) == GPIO_PIN_SET; }
static int clock_high(void) {
    scl(1);
    while (HAL_GPIO_ReadPin(STARDROP_I2C_SCL_GPIO_PORT, STARDROP_I2C_SCL_GPIO_PIN) != GPIO_PIN_SET) {
        if ((uint32_t)(HAL_GetTick() - deadline) >= STARDROP_I2C_TIMEOUT_MS) return 0;
    }
    return (uint32_t)(HAL_GetTick() - deadline) < STARDROP_I2C_TIMEOUT_MS;
}
static int start_bus(void) {
    sda(1); pause_bus();
    if (!clock_high() || !sda_high()) return 0;
    pause_bus(); sda(0); pause_bus(); scl(0); return 1;
}
static void stop_bus(void) {
    sda(0); pause_bus(); (void)clock_high(); pause_bus(); sda(1); pause_bus();
}
static int write_byte(uint8_t byte) {
    for (int bit = 7; bit >= 0; --bit) {
        sda((byte >> bit) & 1); pause_bus();
        if (!clock_high()) return 0;
        pause_bus(); scl(0);
    }
    sda(1); pause_bus(); if (!clock_high()) return 0;
    pause_bus(); int ack = !sda_high(); scl(0); return ack;
}
static int read_byte(uint8_t *byte, int ack) {
    *byte = 0; sda(1);
    for (int bit = 0; bit < 8; ++bit) {
        pause_bus(); if (!clock_high()) return 0;
        pause_bus(); *byte = (uint8_t)((*byte << 1) | sda_high()); scl(0);
    }
    sda(!ack); pause_bus(); if (!clock_high()) return 0;
    pause_bus(); scl(0); sda(1); return 1;
}
HAL_StatusTypeDef stardrop_i2c_init(I2C_HandleTypeDef *bus) {
    (void)bus;
    STARDROP_I2C_SCL_GPIO_CLK_ENABLE(); STARDROP_I2C_SDA_GPIO_CLK_ENABLE();
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
    scl(1); sda(1);
    GPIO_InitTypeDef pin = {0}; pin.Mode = GPIO_MODE_OUTPUT_OD;
    pin.Pull = GPIO_NOPULL; pin.Speed = GPIO_SPEED_FREQ_LOW;
    pin.Pin = STARDROP_I2C_SCL_GPIO_PIN; HAL_GPIO_Init(STARDROP_I2C_SCL_GPIO_PORT, &pin);
    pin.Pin = STARDROP_I2C_SDA_GPIO_PIN; HAL_GPIO_Init(STARDROP_I2C_SDA_GPIO_PORT, &pin);
    deadline = HAL_GetTick();
    return clock_high() && sda_high() ? HAL_OK : HAL_ERROR;
}
HAL_StatusTypeDef stardrop_i2c_read(I2C_HandleTypeDef *bus, uint16_t address, uint8_t reg, uint8_t *data, uint16_t size) {
    (void)bus; if (!data || !size || size > 32) return HAL_ERROR;
    deadline = HAL_GetTick();
    int ok = start_bus() && write_byte((uint8_t)address) && write_byte(reg)
        && start_bus() && write_byte((uint8_t)(address | 1));
    for (uint16_t i = 0; ok && i < size; ++i) ok = read_byte(&data[i], i + 1 < size);
    stop_bus(); return ok ? HAL_OK : HAL_ERROR;
}
HAL_StatusTypeDef stardrop_i2c_write(I2C_HandleTypeDef *bus, uint16_t address, uint8_t reg, uint8_t value) {
    (void)bus; deadline = HAL_GetTick();
    int ok = start_bus() && write_byte((uint8_t)address) && write_byte(reg) && write_byte(value);
    stop_bus(); return ok ? HAL_OK : HAL_ERROR;
}
#else
#if STARDROP_I2C_BUS_NUMBER == 1
#define BUS I2C1
#define ENABLE_BUS() __HAL_RCC_I2C1_CLK_ENABLE()
#define DISABLE_BUS() __HAL_RCC_I2C1_CLK_DISABLE()
#elif STARDROP_I2C_BUS_NUMBER == 2
#define BUS I2C2
#define ENABLE_BUS() __HAL_RCC_I2C2_CLK_ENABLE()
#define DISABLE_BUS() __HAL_RCC_I2C2_CLK_DISABLE()
#elif STARDROP_I2C_BUS_NUMBER == 3
#define BUS I2C3
#define ENABLE_BUS() __HAL_RCC_I2C3_CLK_ENABLE()
#define DISABLE_BUS() __HAL_RCC_I2C3_CLK_DISABLE()
#else
#error Select I2C1, I2C2, I2C3 or software I2C
#endif
void HAL_I2C_MspInit(I2C_HandleTypeDef *bus) {
    if (bus->Instance != BUS) return;
    STARDROP_I2C_SCL_GPIO_CLK_ENABLE(); STARDROP_I2C_SDA_GPIO_CLK_ENABLE(); ENABLE_BUS();
    GPIO_InitTypeDef pin = {0}; pin.Mode = GPIO_MODE_AF_OD; pin.Pull = GPIO_NOPULL;
    pin.Speed = GPIO_SPEED_FREQ_VERY_HIGH; pin.Alternate = 4;
    pin.Pin = STARDROP_I2C_SCL_GPIO_PIN; HAL_GPIO_Init(STARDROP_I2C_SCL_GPIO_PORT, &pin);
    pin.Pin = STARDROP_I2C_SDA_GPIO_PIN; HAL_GPIO_Init(STARDROP_I2C_SDA_GPIO_PORT, &pin);
}
void HAL_I2C_MspDeInit(I2C_HandleTypeDef *bus) {
    if (bus->Instance != BUS) return;
    DISABLE_BUS(); HAL_GPIO_DeInit(STARDROP_I2C_SCL_GPIO_PORT, STARDROP_I2C_SCL_GPIO_PIN);
    HAL_GPIO_DeInit(STARDROP_I2C_SDA_GPIO_PORT, STARDROP_I2C_SDA_GPIO_PIN);
}
HAL_StatusTypeDef stardrop_i2c_init(I2C_HandleTypeDef *bus) {
    bus->Instance = BUS; bus->Init.ClockSpeed = 100000; bus->Init.DutyCycle = I2C_DUTYCYCLE_2;
    bus->Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
    return HAL_I2C_Init(bus);
}
HAL_StatusTypeDef stardrop_i2c_read(I2C_HandleTypeDef *bus, uint16_t address, uint8_t reg, uint8_t *data, uint16_t size) {
    return HAL_I2C_Mem_Read(bus, address, reg, I2C_MEMADD_SIZE_8BIT, data, size, STARDROP_I2C_TIMEOUT_MS);
}
HAL_StatusTypeDef stardrop_i2c_write(I2C_HandleTypeDef *bus, uint16_t address, uint8_t reg, uint8_t value) {
    return HAL_I2C_Mem_Write(bus, address, reg, I2C_MEMADD_SIZE_8BIT, &value, 1, STARDROP_I2C_TIMEOUT_MS);
}
#endif
