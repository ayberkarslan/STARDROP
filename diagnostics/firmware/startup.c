#include <stdint.h>
#include <stddef.h>

extern uint32_t _stack_top, _sidata, _sdata, _edata, _sbss, _ebss;
extern int main(void);
static void default_handler(void) { for (;;) {} }
void reset_handler(void) {
    uint32_t *source = &_sidata;
    for (uint32_t *destination = &_sdata; destination < &_edata;) *destination++ = *source++;
    for (uint32_t *destination = &_sbss; destination < &_ebss;) *destination++ = 0;
    (void)main();
    default_handler();
}

__attribute__((used, section(".isr_vector")))
const void *vectors[16] = {
    &_stack_top, reset_handler, default_handler, default_handler,
    default_handler, default_handler, default_handler, 0,
    0, 0, 0, default_handler, default_handler, 0,
    default_handler, default_handler,
};

void *memcpy(void *destination, const void *source, size_t length) {
    uint8_t *out = destination;
    const uint8_t *in = source;
    while (length--) *out++ = *in++;
    return destination;
}

void *memset(void *destination, int value, size_t length) {
    uint8_t *out = destination;
    while (length--) *out++ = (uint8_t)value;
    return destination;
}
