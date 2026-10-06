#pragma once
/* Defaults are separate: generated pin headers need not repeat sensor settings. */
#ifndef STARDROP_I2C_TIMEOUT_MS
#define STARDROP_I2C_TIMEOUT_MS 20U
#endif
#ifndef STARDROP_SAMPLE_INTERVAL_MS
#define STARDROP_SAMPLE_INTERVAL_MS 100U
#endif
#ifndef STARDROP_BMP180_OSS
#define STARDROP_BMP180_OSS 0U
#endif
#if STARDROP_BMP180_OSS > 3
#error BMP180 oversampling must be 0..3
#endif
#if STARDROP_SAMPLE_INTERVAL_MS < 40 || STARDROP_SAMPLE_INTERVAL_MS > 60000
#error Sample interval must be 40..60000 ms
#endif
