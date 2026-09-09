(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-remove-unused-exports_object-literal_input_0pihkv0kdfy3b._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/object-literal/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$object$2d$literal$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/object-literal/input/lib.js [test] (ecmascript)");
;
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$object$2d$literal$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__["used"], (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$object$2d$literal$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__["usedFn"])(), __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$cjs$2d$remove$2d$unused$2d$exports$2f$object$2d$literal$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__["usedShort"]);
__turbopack_context__.s([]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/object-literal/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// Hand-written / transpiled CJS: named exports declared as a whole-object
// `module.exports = { … }` literal. An unused data property keeps its value's
// side effects in place via `...(void …)`; an unused shorthand (a plain ident
// read) is removed outright.
const usedShort = 'used-short';
const unusedShort = 'unused-short';
module.exports = {
    used: 'used-value',
    ...void 'unused-value',
    usedShort,
    usedFn: function() {
        return 'used-fn';
    },
    ...void function() {
        return 'unused-fn';
    }
};
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-remove-unused-exports_object-literal_input_0pihkv0kdfy3b._.js.map