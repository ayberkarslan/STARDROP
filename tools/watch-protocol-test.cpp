#include "../include/watch_protocol.h"
#include <cassert>
#include <string>
int main() {
    Watch::Address items[16]; unsigned count = 0;
    const auto valid = [&](const char *text, uint32_t end = 0x20020000) { return Watch::addresses(text, items, count, end); };
    assert(valid("536870912:4,536870920:8")); assert(count == 2);
    assert(items[1].address == 0x20000008 && items[1].size == 8);
    assert(valid("537001983:1")); assert(!valid("537001983:4"));
    assert(!valid("0:4")); assert(!valid("1073741824:4"));
    assert(!valid("536870912:3")); assert(!valid("536870912:4,"));
    assert(!valid("536870912")); assert(!valid("536870912:"));
    assert(!valid("-1:4")); assert(!valid("4294967296:4"));
    assert(!valid("536870912:4", 0)); assert(!valid(nullptr)); assert(!valid(""));
    std::string many;
    for (unsigned i = 0; i < 16; ++i) { if (i) many += ','; many += "536870912:4"; }
    assert(valid(many.c_str())); many += ",536870912:4"; assert(!valid(many.c_str()));
    assert(Watch::ramEnd(0x421) == 0x20020000); assert(Watch::ramEnd(0x423) == 0x20010000); assert(Watch::ramEnd(0) == 0);
}
