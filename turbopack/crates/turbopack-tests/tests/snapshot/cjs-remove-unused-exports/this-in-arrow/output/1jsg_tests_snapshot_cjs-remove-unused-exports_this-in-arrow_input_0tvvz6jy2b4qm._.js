(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-remove-unused-exports_this-in-arrow_input_0tvvz6jy2b4qm._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/this-in-arrow/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$this$2d$in$2d$arrow$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/this-in-arrow/input/lib.js [test] (ecmascript)");
;
console.log((0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$this$2d$in$2d$arrow$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__["leak"])());
__turbopack_context__.s([]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/this-in-arrow/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// `viaThis` is pure and never imported by name, so it looks droppable. But it is
// read through `this` in a top-level arrow — where `this` aliases `exports` — so
// the module must be treated as opaque CommonJS and nothing may be dropped.
exports.viaThis = 'V';
exports.leak = ()=>/*TURBOPACK member replacement*/ __turbopack_context__.e.viaThis;
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-remove-unused-exports_this-in-arrow_input_0tvvz6jy2b4qm._.js.map