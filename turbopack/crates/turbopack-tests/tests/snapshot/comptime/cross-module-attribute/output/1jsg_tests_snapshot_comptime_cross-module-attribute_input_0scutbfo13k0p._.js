(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_comptime_cross-module-attribute_input_0scutbfo13k0p._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-attribute/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$attribute$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-attribute/input/other.js [test] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$attribute$2f$input$2f$non$2d$constant$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-attribute/input/non-constant.js [test] (ecmascript)");
;
if ("TURBOPACK compile-time truthy", 1) {
    console.log('x');
} else //TURBOPACK unreachable
;
console.log(("TURBOPACK compile-time value", "lowercase"));
;
if (__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$attribute$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["UPPER"] === 'UPPER') {
    console.log('x');
} else {
    (()=>{
        const e = new Error("Cannot find module './correct-not-inlined'");
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    })();
}
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$attribute$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["UPPER"]);
;
if (__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$attribute$2f$input$2f$non$2d$constant$2e$js__$5b$test$5d$__$28$ecmascript$29$__["nonConstant"].v === 1234) {
    console.log('x');
} else {
    (()=>{
        const e = new Error("Cannot find module './correct-not-inlined'");
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    })();
}
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$attribute$2f$input$2f$non$2d$constant$2e$js__$5b$test$5d$__$28$ecmascript$29$__["nonConstant"]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-attribute/input/non-constant.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "nonConstant",
    ()=>nonConstant
]);
const nonConstant = {
    v: 1234
};
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-attribute/input/other.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UPPER",
    ()=>UPPER,
    "lower",
    ()=>lower
]);
const lower = 'lowercase';
const UPPER = 'UPPER';
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_comptime_cross-module-attribute_input_0scutbfo13k0p._.js.map