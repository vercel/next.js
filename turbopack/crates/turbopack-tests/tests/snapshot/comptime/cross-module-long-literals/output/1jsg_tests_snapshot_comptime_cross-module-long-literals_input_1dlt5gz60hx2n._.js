(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_comptime_cross-module-long-literals_input_1dlt5gz60hx2n._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-long-literals/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-long-literals/input/other.js [test] (ecmascript)");
;
// shouldn't inline
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["LONG_STRING"], __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["LONG_NUMBER"], __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["LONG_BIG_NUMBER"], __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["REGEX"]);
// TODO ideally would still use for evaluation even though not inlined
if (__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["LONG_STRING"] && __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["LONG_NUMBER"] && __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["LONG_BIG_NUMBER"] && __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["REGEX"]) {
    console.log('ok');
} else {
    (()=>{
        const e = new Error("Cannot find module './dead-code'");
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    })();
}
// TODO ideally would inline NaN and Infinity, but currently doesn't
if (__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["NAN"] != undefined && __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$long$2d$literals$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__["INFINITY"]) {
    console.log('ok');
} else {
    (()=>{
        const e = new Error("Cannot find module './dead-code'");
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    })();
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-long-literals/input/other.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "INFINITY",
    ()=>INFINITY,
    "LONG_BIG_NUMBER",
    ()=>LONG_BIG_NUMBER,
    "LONG_NUMBER",
    ()=>LONG_NUMBER,
    "LONG_STRING",
    ()=>LONG_STRING,
    "NAN",
    ()=>NAN,
    "REGEX",
    ()=>REGEX
]);
const LONG_STRING = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789';
const LONG_NUMBER = 21345672345678345678901234567890;
const LONG_BIG_NUMBER = 21345672345678345678901234567890n;
const REGEX = /ab/i;
const NAN = NaN;
const INFINITY = Infinity;
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_comptime_cross-module-long-literals_input_1dlt5gz60hx2n._.js.map