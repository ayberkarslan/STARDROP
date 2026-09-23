MEMORY { FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 512K
         RAM (rwx) : ORIGIN = 0x20000200, LENGTH = 0x1FE00 }
_stack_top = ORIGIN(RAM) + LENGTH(RAM);
SECTIONS {
  .isr_vector : { KEEP(*(.isr_vector)) } > FLASH
  .text : { *(.text*) *(.rodata*) } > FLASH
  .data : { _sdata = .; *(.data*) _edata = .; } > RAM AT > FLASH
  _sidata = LOADADDR(.data);
  .bss (NOLOAD) : { _sbss = .; *(.bss*) *(COMMON) _ebss = .; } > RAM
  . = ALIGN(4);
  ASSERT(_ebss < _stack_top - 1024, "RAM overflow")
}
