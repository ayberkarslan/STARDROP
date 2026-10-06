#include "bmp180.h"
#include "stardrop_i2c.h"
#include "sensor_config.h"

#define BMP180_REG_CALIB_START 0xAA
#define BMP180_REG_ID          0xD0
#define BMP180_REG_CONTROL     0xF4
#define BMP180_REG_DATA        0xF6

#define BMP180_CMD_READ_TEMP   0x2E
#define BMP180_CMD_READ_PRESS  0x34

BMP180::BMP180(I2C_HandleTypeDef* hi2c) : i2c(hi2c), temperature_c(0.0f), pressure_pa(0.0f) {
    oss = STARDROP_BMP180_OSS;
}

bool BMP180::init() {
    initialized = false;
    error = Error::BUS;
    chip_id = 0;
    // Check chip ID
    if (stardrop_i2c_read(i2c, I2C_ADDR, BMP180_REG_ID, &chip_id, 1) != HAL_OK) {
        return false;
    }
    if (chip_id != 0x55) {
        error = Error::IDENTITY;
        return false;
    }

    if (!readCalibrationData()) return false;
    initialized = ac4 != 0 && ac4 != 0xffff && ac5 != 0 && ac5 != 0xffff;
    error = initialized ? Error::NONE : Error::CALIBRATION;
    return initialized;
}

BMP180::Status BMP180::read() {
    if (!initialized) return Status::NOT_READY;
    error = Error::BUS;
    uint16_t ut_raw = 0;
    uint32_t up_raw = 0;

    // 1. Start Temperature Measurement
    if (!writeCommand(BMP180_REG_CONTROL, BMP180_CMD_READ_TEMP)) {
        return Status::ERROR;
    }
    HAL_Delay(5); // Minimum 4.5ms

    if (!readData16(BMP180_REG_DATA, ut_raw)) {
        return Status::ERROR;
    }

    // 2. Start Pressure Measurement
    uint8_t cmd_press = BMP180_CMD_READ_PRESS + (oss << 6);
    if (!writeCommand(BMP180_REG_CONTROL, cmd_press)) {
        return Status::ERROR;
    }

    // Wait based on oversampling
    if (oss == 0) HAL_Delay(5);
    else if (oss == 1) HAL_Delay(8);
    else if (oss == 2) HAL_Delay(14);
    else if (oss == 3) HAL_Delay(26);

    if (!readData24(BMP180_REG_DATA, up_raw)) {
        return Status::ERROR;
    }
    up_raw >>= (8 - oss);

    // 3. Calculate true values
    bool valid = calculateTrueValues(ut_raw, up_raw);
    error = valid ? Error::NONE : Error::RANGE;
    return valid ? Status::SUCCESS : Status::ERROR;
}

bool BMP180::readCalibrationData() {
    if (!readData16_Signed(0xAA, ac1)) return false;
    if (!readData16_Signed(0xAC, ac2)) return false;
    if (!readData16_Signed(0xAE, ac3)) return false;
    if (!readData16(0xB0, ac4)) return false;
    if (!readData16(0xB2, ac5)) return false;
    if (!readData16(0xB4, ac6)) return false;
    if (!readData16_Signed(0xB6, b1)) return false;
    if (!readData16_Signed(0xB8, b2)) return false;
    if (!readData16_Signed(0xBA, mb)) return false;
    if (!readData16_Signed(0xBC, mc)) return false;
    if (!readData16_Signed(0xBE, md)) return false;
    return true;
}

bool BMP180::writeCommand(uint8_t reg, uint8_t value) {
    return stardrop_i2c_write(i2c, I2C_ADDR, reg, value) == HAL_OK;
}

bool BMP180::readData16(uint8_t reg, uint16_t& value) {
    uint8_t data[2];
    if (stardrop_i2c_read(i2c, I2C_ADDR, reg, data, 2) != HAL_OK) {
        return false;
    }
    value = (data[0] << 8) | data[1];
    return true;
}

bool BMP180::readData16_Signed(uint8_t reg, int16_t& value) {
    uint16_t raw;
    if (!readData16(reg, raw)) return false;
    value = (int16_t)raw;
    return true;
}

bool BMP180::readData24(uint8_t reg, uint32_t& value) {
    uint8_t data[3];
    if (stardrop_i2c_read(i2c, I2C_ADDR, reg, data, 3) != HAL_OK) {
        return false;
    }
    value = (data[0] << 16) | (data[1] << 8) | data[2];
    return true;
}

bool BMP180::calculateTrueValues(int32_t ut, int32_t up) {
    // Temperature Calculation
    int64_t x1 = ((int64_t)(ut - ac6) * ac5) >> 15;
    if (x1 + md == 0) return false;
    int64_t x2 = ((int64_t)mc * 2048) / (x1 + md);
    int64_t b5 = x1 + x2;
    int64_t t = (b5 + 8) >> 4;
    if (t < -400 || t > 850) return false;

    // Pressure Calculation
    int64_t b6 = b5 - 4000;
    x1 = (b2 * ((b6 * b6) >> 12)) >> 11;
    x2 = (ac2 * b6) >> 11;
    int64_t x3 = x1 + x2;
    int64_t b3 = (((ac1 * 4 + x3) * (1 << oss)) + 2) >> 2;

    x1 = (ac3 * b6) >> 13;
    x2 = (b1 * ((b6 * b6) >> 12)) >> 16;
    x3 = ((x1 + x2) + 2) >> 2;
    if (x3 + 32768 <= 0 || up < b3) return false;
    uint64_t b4 = ((uint64_t)ac4 * (uint64_t)(x3 + 32768)) >> 15;
    if (!b4) return false;
    uint64_t b7 = (uint64_t)(up - b3) * (50000 >> oss);

    int64_t p;
    if (b7 < 0x80000000) {
        p = (b7 * 2) / b4;
    } else {
        p = (b7 / b4) * 2;
    }

    if (p > 200000) return false;
    x1 = (p >> 8) * (p >> 8);
    x1 = (x1 * 3038) >> 16;
    x2 = (-7357 * p) >> 16;
    p += (x1 + x2 + 3791) >> 4;

    if (p < 30000 || p > 110000) return false;
    temperature_c = t / 10.0f;
    pressure_pa = (float)p;
    return true;
}
