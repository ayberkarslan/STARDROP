# BMP581 · STM32F446RE

Pressure and temperature using Bosch's BMP5 SensorAPI, pinned to
`3bd7c260419e4d08d7fa28343f27e0e6dd276411` (BSD-3-Clause).
Upstream: https://github.com/boschsensortec/BMP5_SensorAPI.
Vendor files are unchanged; copyright and license are in `vendor/bosch/`.

## OBC wiring

Compared against `OBC - Copy.NET` and `Schematic PDF_[No Variations]-6.pdf`:

| BMP581 IC6 | MCU / wiring |
| --- | --- |
| SCK pin 2 (SCL) | PA8 |
| SDI pin 4 (SDA) | PB4 |
| INT pin 7 | PA9, not used by this polling test |
| CSB pin 6 | VDDIO through SB14; bridge must be closed for I²C |
| SDO pin 5 | GND through SB15; bridge selects address, code probes 0x46 and 0x47 |
| VDD / VDDIO | 3V3_BMP |
| SCL/SDA pull-ups | R26/R25, 10 kΩ to 3V3_BMP |

**PA8/PB4 is not a hardware I2C3 pin pair**, despite the schematic's I2C3
label. The default header uses software I²C. Hardware I2C3 needs PA8/PC9.
The UI generates `pin_configurations.h` for each build. Other peripherals,
including the BHI360, are not initialized or driven by this test.

## Build and watch

From this directory run `node build.mjs` with ARM GCC in PATH. Output:
`build/bmp581-f446.elf` and `.bin`. Or choose BMP581 from the GitHub catalog
after publishing this directory **along with the catalog and shared templates**.

Load the ELF, then add `pressure_pa` to Live Expressions. Additional globals:
`temperature_c`, `sample_counter`, `last_sample_ms`, `sensor_status`,
`sensor_error`, `sensor_chip_id`, `sensor_i2c_address`, `i2c_status`.
Sensor status: 0 waiting, 1 valid, 2 error. Pressure is Pa, not hPa.
Expected chip ID: 0x50. Bosch error codes are in `vendor/bosch/bmp5_defs.h`;
-2 communication, -4 identity, -5 NVM not ready, -100 invalid measurement,
-101 no new sample for 1 second, -102 MCU clock initialization.

The sensor runs at 10 Hz. The main loop polls every 100 ms; it only increments
the counter on a fresh DRDY sample. No UART or extra ESP wires are needed.
It also publishes SWD telemetry and a first-sample diagnostic report.
On error, old values remain but status/telemetry validity mark them invalid.
Firmware starts with NaN values to avoid presenting zero as a successful reading.

## Verification boundary

Cross-compiled with both OBC software pins and hardware I2C3; ELF globals
checked. Mock-bus tests do not replace physical testing. No hardware success is
claimed until the real board acknowledges the chip and produces fresh pressure.
PDF text matching confirms labels/part identities only; NET provides GPIO paths.
Neither file proves physical supply, solder-bridge continuity or SWD reliability.
