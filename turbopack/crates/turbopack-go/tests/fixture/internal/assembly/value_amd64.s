#include "textflag.h"
#include "value.h"
#define ASSEMBLY_EXTRA 1

TEXT ·Value(SB), NOSPLIT, $0-8
    MOVQ $ASSEMBLY_VALUE, AX
    ADDQ $ASSEMBLY_EXTRA, AX
    MOVQ AX, ret+0(FP)
    RET
