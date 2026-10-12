#pragma once
#include <stdint.h>
namespace Watch {
constexpr unsigned maxVariables = 16;
struct Address { uint32_t address; unsigned size; };
inline bool hex(const char *text, unsigned length) {
    if (!text) return false;
    for (unsigned i = 0; i < length; ++i) {
        const char c = text[i];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
    }
    return text[length] == '\0';
}
inline bool decimal(const char *&text, uint32_t &value) {
    value = 0; unsigned digits = 0;
    while (*text >= '0' && *text <= '9') {
        const unsigned digit = *text++ - '0';
        if (++digits > 10 || value > (UINT32_MAX - digit) / 10) return false;
        value = value * 10 + digit;
    }
    return digits != 0;
}
inline bool addresses(const char *text, Address *result, unsigned &count, uint32_t ramEnd) {
    count = 0;
    if (!text || !*text) return false;
    while (*text) {
        uint32_t address, size;
        if (count >= maxVariables || !decimal(text, address) || *text++ != ':' || !decimal(text, size)
            || (size != 1 && size != 2 && size != 4 && size != 8)
            || address < 0x20000000 || address >= ramEnd || size > ramEnd - address) return false;
        result[count++] = {address, size};
        if (!*text) return true;
        if (*text++ != ',' || !*text) return false;
    }
    return false;
}
inline uint32_t ramEnd(uint16_t device) {
    switch (device) {
        case 0x423: return 0x20010000; // F401xB/xC: 64 KB
        case 0x433: return 0x20018000; // F401xD/xE: 96 KB
        case 0x421: case 0x431: return 0x20020000; // F446/F411: 128 KB
        default: return 0;
    }
}
}
