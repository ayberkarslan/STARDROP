#include "bmp180.h"
#include "stardrop_i2c.h"
#include "stardrop_telemetry.h"
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <iostream>
static uint8_t registers[256];
static unsigned calls;
static bool broken;
static uint32_t raw_pressure = 23843;
static void reg16(unsigned reg, int value) {
    registers[reg] = (uint16_t)value >> 8; registers[reg + 1] = (uint8_t)value;
}
static void calibration(void) {
    std::memset(registers, 0, sizeof(registers)); registers[0xd0] = 0x55;
    // Bosch datasheet reference vector: 15.0 degC, 69964 Pa.
    const int values[] = {408, -72, -14383, 32741, 32757, 23153, 6190, 4, -32768, -8711, 2868};
    for (unsigned i = 0; i < 11; ++i) reg16(0xaa + i * 2, values[i]);
    calls = 0; broken = false; raw_pressure = 23843;
}
extern "C" void HAL_Delay(uint32_t) {}
extern "C" HAL_StatusTypeDef stardrop_i2c_read(I2C_HandleTypeDef *, uint16_t addr, uint8_t reg, uint8_t *data, uint16_t size) {
    ++calls; assert(addr == (0x77 << 1));
    if (broken) return HAL_ERROR;
    std::memcpy(data, &registers[reg], size); return HAL_OK;
}
extern "C" HAL_StatusTypeDef stardrop_i2c_write(I2C_HandleTypeDef *, uint16_t, uint8_t reg, uint8_t value) {
    ++calls; if (broken) return HAL_ERROR;
    assert(reg == 0xf4);
    if (value == 0x2e) reg16(0xf6, 27898);
    else {
        uint32_t raw = raw_pressure << 8;
        registers[0xf6] = raw >> 16; registers[0xf7] = raw >> 8; registers[0xf8] = raw;
    }
    return HAL_OK;
}
static uint32_t crc32(const stardrop_telemetry_t &frame) {
    auto bytes = reinterpret_cast<const uint8_t *>(&frame);
    uint32_t crc = 0xffffffff;
    for (unsigned i = 0; i < offsetof(stardrop_telemetry_t, crc32); ++i) {
        crc ^= bytes[i];
        for (unsigned bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ (0xedb88320U & (0U - (crc & 1U)));
    }
    return ~crc;
}
static stardrop_telemetry_t snapshot(void) {
    stardrop_telemetry_t frame;
    std::memcpy(&frame, (const void *)&stardrop_telemetry, sizeof(frame)); return frame;
}
int main(void) {
    I2C_HandleTypeDef bus = {};
    calibration(); BMP180 fresh(&bus);
    assert(fresh.read() == BMP180::Status::NOT_READY && calls == 0);
    assert(fresh.init()); assert(fresh.read() == BMP180::Status::SUCCESS);
    assert(std::fabs(fresh.getTemperatureC() - 15.0f) < 0.01f);
    assert(fresh.getPressurePa() == 69964.0f);
    broken = true; assert(fresh.read() == BMP180::Status::ERROR);
    assert(fresh.getError() == BMP180::Error::BUS);
    assert(fresh.getPressurePa() == 69964.0f);
    calibration(); registers[0xd0] = 0x60; BMP180 wrong_chip(&bus);
    assert(!wrong_chip.init()); unsigned before = calls;
    assert(wrong_chip.getError() == BMP180::Error::IDENTITY && wrong_chip.getChipId() == 0x60);
    assert(wrong_chip.read() == BMP180::Status::NOT_READY && calls == before);
    calibration(); reg16(0xb0, 0); BMP180 zero_calibration(&bus); assert(!zero_calibration.init());
    calibration(); reg16(0xbe, -4743); BMP180 zero_divisor(&bus); assert(zero_divisor.init());
    assert(zero_divisor.read() == BMP180::Status::ERROR);
    assert(zero_divisor.getError() == BMP180::Error::RANGE);
    calibration(); BMP180 invalid_range(&bus); assert(invalid_range.init()); raw_pressure = 0;
    assert(invalid_range.read() == BMP180::Status::ERROR);
    stardrop_telemetry_init();
    stardrop_channel_t channels[2] = {{"temperature", "degC", 15, 1}, {"pressure", "Pa", 69964, 1}};
    stardrop_telemetry_publish(100, 1, 1, channels, 2);
    auto frame = snapshot();
    assert(frame.magic == STARDROP_TELEMETRY_MAGIC && frame.version == 1 && frame.size == 400);
    assert(frame.sequence == 2 && frame.sample_counter == 1 && frame.timestamp_ms == 100);
    assert(frame.channel_count == 2 && frame.channels[1].value == 69964);
    assert(frame.crc32 == crc32(frame));
    frame.channels[0].value = 100; assert(frame.crc32 != crc32(frame));
    channels[0].valid = channels[1].valid = 0;
    stardrop_telemetry_publish(100, 1, 2, channels, 2); frame = snapshot();
    assert(frame.sequence == 4 && frame.status == 2 && frame.channels[0].valid == 0);
    assert(frame.sample_counter == 1 && frame.timestamp_ms == 100 && frame.crc32 == crc32(frame));
    stardrop_telemetry_publish(200, 2, 1, channels, 9); assert(snapshot().sequence == 4);
    std::cout << "BMP180 hesaplama, hata ve telemetri testleri geçti\n";
}
