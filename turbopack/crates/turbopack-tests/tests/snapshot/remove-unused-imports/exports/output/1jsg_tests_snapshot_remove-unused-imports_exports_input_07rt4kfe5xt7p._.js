(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_remove-unused-imports_exports_input_07rt4kfe5xt7p._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/a.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$y$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/remove-unused-imports/exports/input/library/y.js [test] (ecmascript)");
var __TURBOPACK__imported__binding__a4ed027416851b47__ = __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$y$2e$js__$5b$test$5d$__$28$ecmascript$29$__["y"];
;
;
__TURBOPACK__imported__binding__a4ed027416851b47__();
function helper() {
    return x();
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
var __TURBOPACK__imported__binding__a3c288d1f3fa1f8a__ = __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$a$2e$js__$5b$test$5d$__$28$ecmascript$29$__["used"];
;
console.log(__TURBOPACK__imported__binding__a3c288d1f3fa1f8a__);
__turbopack_context__.s([]);
}),
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
var __TURBOPACK__imported__binding__0286f52b478b9e01__ = __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$leaf$2e$js__$5b$test$5d$__$28$ecmascript$29$__["leafY"];
;
function sharedX() {
    leafX();
}
function sharedY() {
    __TURBOPACK__imported__binding__0286f52b478b9e01__();
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
var __TURBOPACK__imported__binding__42af059a9d37d7f9__ = __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$remove$2d$unused$2d$imports$2f$exports$2f$input$2f$library$2f$shared$2e$js__$5b$test$5d$__$28$ecmascript$29$__["sharedY"];
;
globalThis.yBundled = true;
function y() {
    __TURBOPACK__imported__binding__42af059a9d37d7f9__();
}
__turbopack_context__.s([
    "y",
    0,
    y
]);
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_remove-unused-imports_exports_input_07rt4kfe5xt7p._.js.map