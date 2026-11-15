#include "textflag.h"
#include "value.h"
#define ASSEMBLY_EXTRA 1

TEXT ·Value(SB), NOSPLIT, $0-8
    MOVD $ASSEMBLY_VALUE, R0
    ADD $ASSEMBLY_EXTRA, R0
    MOVD R0, ret+0(FP)
    RET
