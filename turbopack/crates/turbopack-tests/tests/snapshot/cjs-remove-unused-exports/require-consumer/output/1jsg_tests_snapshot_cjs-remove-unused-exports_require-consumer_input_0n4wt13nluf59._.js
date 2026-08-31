(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-remove-unused-exports_require-consumer_input_0n4wt13nluf59._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-consumer/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$require$2d$consumer$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-consumer/input/lib.js [test] (ecmascript)");
;
// A wholesale `require()` consumer reports `ExportUsage::All`, so the graph must
// mark every export used and nothing may be dropped.
const lib = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-consumer/input/lib.js [test] (ecmascript)");
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$require$2d$consumer$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__["used"], lib.unused);
__turbopack_context__.s([]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-consumer/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

exports.used = 'used-value';
exports.unused = 'unused-value';
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-remove-unused-exports_require-consumer_input_0n4wt13nluf59._.js.map