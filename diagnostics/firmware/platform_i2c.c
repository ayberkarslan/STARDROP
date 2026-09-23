#include <stdint.h>
#include "generated_config.h"
#include "diagnostic_test.h"

/* HSI is 16 MHz after reset on both supported MCUs. Software I2C keeps pin
 * mapping independent of alternate-function assignments. External pull-ups
 * and correct bus voltage are still required on the actual board. */
#define REG32(address) (*(volatile uint32_t *)(address))
#define RCC_AHB1ENR REG32(0x40023830UL)
#define GPIO_BASE(port) (0x40020000UL + ((uint32_t)(port) * 0x400UL))
#define GPIO_MODER(port) REG32(GPIO_BASE(port) + 0x00UL)
#define GPIO_OTYPER(port) REG32(GPIO_BASE(port) + 0x04UL)
#define GPIO_PUPDR(port) REG32(GPIO_BASE(port) + 0x0CUL)
#define GPIO_IDR(port) REG32(GPIO_BASE(port) + 0x10UL)
#define GPIO_BSRR(port) REG32(GPIO_BASE(port) + 0x18UL)
#define SYST_CSR REG32(0xE000E010UL)
#define SYST_RVR REG32(0xE000E014UL)
#define SYST_CVR REG32(0xE000E018UL)

static void delay_us(uint32_t microseconds) {
    while (microseconds--) {
        SYST_CSR = 0;
        SYST_RVR = 15;
        SYST_CVR = 0;
        SYST_CSR = 5;
        while (!(SYST_CSR & (1UL << 16))) {}
    }
}

void delay_ms(uint32_t milliseconds) { while (milliseconds--) delay_us(1000); }

static void drive(uint32_t port, uint32_t pin, int high) {
    GPIO_BSRR(port) = high ? (1UL << pin) : (1UL << (pin + 16));
}
static int sample(uint32_t port, uint32_t pin) { return (GPIO_IDR(port) >> pin) & 1U; }
static void scl(int high) { drive(STARDROP_SCL_PORT, STARDROP_SCL_PIN, high); }
static void sda(int high) { drive(STARDROP_SDA_PORT, STARDROP_SDA_PIN, high); }
static int sda_level(void) { return sample(STARDROP_SDA_PORT, STARDROP_SDA_PIN); }
static int scl_level(void) { return sample(STARDROP_SCL_PORT, STARDROP_SCL_PIN); }

static void configure_pin(uint32_t port, uint32_t pin) {
    RCC_AHB1ENR |= 1UL << port;
    (void)RCC_AHB1ENR;
    GPIO_BSRR(port) = 1UL << pin;
    GPIO_OTYPER(port) |= 1UL << pin;
    GPIO_PUPDR(port) = (GPIO_PUPDR(port) & ~(3UL << (pin * 2))) | (1UL << (pin * 2));
    GPIO_MODER(port) = (GPIO_MODER(port) & ~(3UL << (pin * 2))) | (1UL << (pin * 2));
}

void platform_i2c_init(void) {
    configure_pin(STARDROP_SCL_PORT, STARDROP_SCL_PIN);
    configure_pin(STARDROP_SDA_PORT, STARDROP_SDA_PIN);
    scl(1); sda(1); delay_us(10);
}

static int wait_scl(void) {
    scl(1);
    for (uint32_t retry = 0; retry < 100; ++retry) {
        if (scl_level()) return 1;
        delay_us(10);
    }
    return 0;
}
static int start(void) {
    sda(1); delay_us(5);
    if (!wait_scl() || !sda_level()) return 0;
    delay_us(5); sda(0); delay_us(5); scl(0);
    return 1;
}
static void stop(void) {
    sda(0); delay_us(5); (void)wait_scl(); delay_us(5); sda(1); delay_us(5);
}
static int write_byte(uint8_t value) {
    for (int bit = 7; bit >= 0; --bit) {
        sda((value >> bit) & 1); delay_us(4);
        if (!wait_scl()) return 0;
        delay_us(5); scl(0); delay_us(3);
    }
    sda(1); delay_us(4);
    if (!wait_scl()) return 0;
    delay_us(4); int acknowledged = !sda_level();
    scl(0); delay_us(3);
    return acknowledged;
}
static uint8_t read_byte(int acknowledge) {
    uint8_t value = 0;
    sda(1);
    for (int bit = 0; bit < 8; ++bit) {
        delay_us(4); (void)wait_scl(); delay_us(4);
        value = (uint8_t)((value << 1) | sda_level());
        scl(0); delay_us(3);
    }
    sda(!acknowledge); delay_us(4); (void)wait_scl(); delay_us(5); scl(0); sda(1);
    return value;
}

int i2c_write(uint8_t address, const uint8_t *bytes, uint32_t length) {
    if (!start()) { stop(); return 0; }
    if (!write_byte((uint8_t)(address << 1))) { stop(); return 0; }
    for (uint32_t index = 0; index < length; ++index) {
        if (!write_byte(bytes[index])) { stop(); return 0; }
    }
    stop(); return 1;
}
int i2c_read(uint8_t address, uint8_t *bytes, uint32_t length) {
    if (!start()) { stop(); return 0; }
    if (!write_byte((uint8_t)((address << 1) | 1))) { stop(); return 0; }
    for (uint32_t index = 0; index < length; ++index) bytes[index] = read_byte(index + 1 < length);
    stop(); return 1;
}
int i2c_read_register(uint8_t address, uint8_t reg, uint8_t *bytes, uint32_t length) {
    if (!start()) { stop(); return 0; }
    if (!write_byte((uint8_t)(address << 1)) || !write_byte(reg)) { stop(); return 0; }
    if (!start()) { stop(); return 0; } /* repeated START, no STOP between address and read */
    if (!write_byte((uint8_t)((address << 1) | 1))) { stop(); return 0; }
    for (uint32_t index = 0; index < length; ++index) bytes[index] = read_byte(index + 1 < length);
    stop(); return 1;
}
