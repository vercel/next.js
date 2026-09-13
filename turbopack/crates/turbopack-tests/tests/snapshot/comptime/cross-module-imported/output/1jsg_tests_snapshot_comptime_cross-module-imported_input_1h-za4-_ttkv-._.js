(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_comptime_cross-module-imported_input_1h-za4-_ttkv-._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-imported/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$imported$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-imported/input/other.js [test] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$imported$2f$input$2f$third$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-imported/input/third.js [test] (ecmascript)");
;
if ("TURBOPACK compile-time truthy", 1) {
    console.log('x');
} else //TURBOPACK unreachable
;
console.log(("TURBOPACK compile-time value", "x"));
// --------------------------------------------------------------------------
// These aren't considered to be constants
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$imported$2f$input$2f$third$2e$js__$5b$test$5d$__$28$ecmascript$29$__["IMPORTED_EXPORTED"]);
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$imported$2f$input$2f$third$2e$js__$5b$test$5d$__$28$ecmascript$29$__["REEXPORTED"]);
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$imported$2f$input$2f$other$2e$js__$5b$test$5d$__$28$ecmascript$29$__$3c$locals$3e$__["USING_IMPORTED_EXPORTED"]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-imported/input/other.js [test] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SOME_VALUE",
    ()=>SOME_VALUE,
    "USING_IMPORTED_EXPORTED",
    ()=>USING_IMPORTED_EXPORTED
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$imported$2f$input$2f$third$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-imported/input/third.js [test] (ecmascript)");
const SOME_VALUE = 'x';
;
;
;
const USING_IMPORTED_EXPORTED = 'x' + __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$comptime$2f$cross$2d$module$2d$imported$2f$input$2f$third$2e$js__$5b$test$5d$__$28$ecmascript$29$__["IMPORTED_EXPORTED"];
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/cross-module-imported/input/third.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "IMPORTED_EXPORTED",
    ()=>IMPORTED_EXPORTED,
    "REEXPORTED",
    ()=>REEXPORTED
]);
const REEXPORTED = 'reexported';
const IMPORTED_EXPORTED = 'imported exported';
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_comptime_cross-module-imported_input_1h-za4-_ttkv-._.js.map