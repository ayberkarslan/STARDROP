#pragma once
#include <stdint.h>
#include <string.h>
#include <math.h>
namespace Telemetry {
constexpr uint32_t address = 0x20000200UL;
constexpr uint32_t magic = 0x53544c4dUL;
constexpr unsigned size = 400, channelCount = 8, headerSize = 44, channelSize = 44;
inline uint32_t word(const uint8_t *data) {
    return (uint32_t)data[0] | ((uint32_t)data[1] << 8) | ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
}
inline uint32_t crc32(const uint8_t *data, unsigned length) {
    uint32_t crc = 0xffffffffU;
    for (unsigned i = 0; i < length; ++i) {
        crc ^= data[i];
        for (unsigned bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ (0xedb88320U & (0U - (crc & 1U)));
    }
    return ~crc;
}
inline float value(const uint8_t *channel) {
    uint32_t raw = word(channel + 36); float result; memcpy(&result, &raw, 4); return result;
}
inline bool text(const uint8_t *data, unsigned length, bool empty = false) {
    if (!empty && !data[0]) return false;
    for (unsigned i = 0; i < length; ++i) {
        if (!data[i]) return true;
        if (data[i] < 32 || data[i] > 126) return false;
    }
    return false;
}
inline const char *validate(const uint8_t *data, uint32_t before, uint32_t after) {
    if ((before & 1U) || before != after || word(data + 12) != before) return "SNAPSHOT_CHANGED";
    if (word(data) != magic || word(data + 4) != 1 || word(data + 8) != size) return "ABI_INVALID";
    if (word(data + 396) != crc32(data, 396)) return "CRC_INVALID";
    unsigned count = word(data + 28);
    if (count > channelCount || word(data + 24) > 2) return "FRAME_INVALID";
    for (unsigned i = 0; i < count; ++i) {
        const uint8_t *channel = data + headerSize + i * channelSize;
        if (!text(channel, 24) || !text(channel + 24, 12, true) || word(channel + 40) > 1
            || !isfinite(value(channel))) return "CHANNEL_INVALID";
        for (unsigned j = 0; j < i; ++j)
            if (!strcmp((const char *)channel, (const char *)(data + headerSize + j * channelSize))) return "CHANNEL_DUPLICATE";
    }
    return nullptr;
}
}
