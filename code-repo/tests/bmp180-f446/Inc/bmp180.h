#ifndef BMP180_H
#define BMP180_H

#include <stdint.h>
#include "stm32f4xx_hal.h"

class BMP180 {
public:
    enum class Status {
        NOT_READY = 0,
        SUCCESS = 1,
        ERROR = 2
    };
    enum class Error { NONE, BUS, IDENTITY, CALIBRATION, RANGE };

    BMP180(I2C_HandleTypeDef* hi2c);
    
    // Initialize and read calibration data
    bool init();
    
    // Perform blocking reads and calculate results
    // Will wait inside for conversion times
    Status read();

    float getTemperatureC() const { return temperature_c; }
    float getPressurePa() const { return pressure_pa; }
    Error getError() const { return error; }
    uint8_t getChipId() const { return chip_id; }

private:
    I2C_HandleTypeDef* i2c;
    const uint16_t I2C_ADDR = 0x77 << 1; // 0xEE for write

    // Calibration data
    int16_t ac1 = 0, ac2 = 0, ac3 = 0;
    uint16_t ac4 = 0, ac5 = 0, ac6 = 0;
    int16_t b1 = 0, b2 = 0;
    int16_t mb = 0, mc = 0, md = 0;
    bool initialized = false;
    Error error = Error::NONE;
    uint8_t chip_id = 0;
    
    // Oversampling setting (0 to 3)
    // 0: Ultra low power, 1: Standard, 2: High res, 3: Ultra high res
    // 0 -> 4.5ms wait, 3 -> 25.5ms wait
    uint8_t oss = 0;
    
    float temperature_c;
    float pressure_pa;

    bool readCalibrationData();
    bool writeCommand(uint8_t reg, uint8_t value);
    bool readData16(uint8_t reg, uint16_t& value);
    bool readData16_Signed(uint8_t reg, int16_t& value);
    bool readData24(uint8_t reg, uint32_t& value);
    
    bool calculateTrueValues(int32_t ut, int32_t up);
};

#endif // BMP180_H
