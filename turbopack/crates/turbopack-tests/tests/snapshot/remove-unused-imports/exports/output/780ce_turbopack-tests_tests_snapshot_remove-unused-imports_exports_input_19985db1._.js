(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["output/780ce_turbopack-tests_tests_snapshot_remove-unused-imports_exports_input_19985db1._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/library/leaf.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

function leafX() {}
function leafY() {}
__turbopack_context__.s([
    "leafY",
    0,
    leafY
]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/library/shared.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$leaf$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/library/leaf.js [test] (ecmascript)");
;
function sharedX() {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$leaf$2e$js__$5b$test$5d$__$28$ecmascript$29$__["leafX"])();
}
function sharedY() {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$leaf$2e$js__$5b$test$5d$__$28$ecmascript$29$__["leafY"])();
}
__turbopack_context__.s([
    "sharedY",
    0,
    sharedY
]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/library/y.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$shared$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/library/shared.js [test] (ecmascript)");
;
globalThis.yBundled = true;
function y() {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$shared$2e$js__$5b$test$5d$__$28$ecmascript$29$__["sharedY"])();
}
__turbopack_context__.s([
    "y",
    0,
    y
]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/a.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$y$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/library/y.js [test] (ecmascript)");
;
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$y$2e$js__$5b$test$5d$__$28$ecmascript$29$__["y"])();
function helper() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$x$2e$js__$5b$test$5d$__$28$ecmascript$29$__["x"])();
}
function unused() {
    return helper();
}
function used() {
    return 1234;
}
__turbopack_context__.s([
    "used",
    0,
    used
]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$a$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/a.js [test] (ecmascript)");
;
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$a$2e$js__$5b$test$5d$__$28$ecmascript$29$__["used"]);
__turbopack_context__.s([]);
}),
]);

//# sourceMappingURL=780ce_turbopack-tests_tests_snapshot_remove-unused-imports_exports_input_19985db1._.js.map