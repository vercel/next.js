(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_comptime_cross-module-cycle-dynamic_input_0y6rllfq_jecq._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$single$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/single.js [test] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$multiple$2d$1$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/multiple-1.js [test] (ecmascript)");
;
;
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$single$2e$js__$5b$test$5d$__$28$ecmascript$29$__["FOO"], __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$multiple$2d$1$2e$js__$5b$test$5d$__$28$ecmascript$29$__["FOO"]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/multiple-1.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FOO",
    ()=>foo1
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$multiple$2d$2$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/multiple-2.js [test] (ecmascript)");
;
function foo1(left, right) {
    // might be an infinite loop at runtime, but shouldn't hang the build
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$multiple$2d$2$2e$js__$5b$test$5d$__$28$ecmascript$29$__["FOO"])(left, right);
}
;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/multiple-2.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FOO",
    ()=>foo2
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$multiple$2d$1$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/multiple-1.js [test] (ecmascript)");
;
function foo2(left, right) {
    // might be an infinite loop at runtime, but shouldn't hang the build
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$multiple$2d$1$2e$js__$5b$test$5d$__$28$ecmascript$29$__["FOO"])(left, right);
}
;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/single.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FOO",
    ()=>foo1
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$single$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-cycle-dynamic/input/single.js [test] (ecmascript)");
;
function foo1(left, right) {
    // might be an infinite loop at runtime, but shouldn't hang the build
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$cycle$2d$dynamic$2f$input$2f$single$2e$js__$5b$test$5d$__$28$ecmascript$29$__["FOO"])(left, right);
}
;
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_comptime_cross-module-cycle-dynamic_input_0y6rllfq_jecq._.js.map