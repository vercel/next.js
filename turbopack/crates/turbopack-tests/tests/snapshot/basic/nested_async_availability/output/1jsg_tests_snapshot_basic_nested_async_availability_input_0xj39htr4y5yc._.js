module.exports = [
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/first.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "first",
    ()=>first
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$nested_async_availability$2f$input$2f$shared$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/shared.js [test] (ecmascript)");
;
function first() {
    return Promise.all([
        __turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/second.js [test] (ecmascript, async loader)"),
        __turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/third.js [test] (ecmascript, async loader)")
    ]).then(([{ second }, { third }])=>__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$nested_async_availability$2f$input$2f$shared$2e$js__$5b$test$5d$__$28$ecmascript$29$__["shared"] + second + third);
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/second.js [test] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "output/1jsg_tests_snapshot_basic_nested_async_availability_input_second_0y5twtlc0uf9g.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/second.js [test] (ecmascript)");
    });
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/shared.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "shared",
    ()=>shared
]);
const shared = 'shared';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/third.js [test] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "output/1jsg_tests_snapshot_basic_nested_async_availability_input_third_18lvy7dfhpmum.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/nested_async_availability/input/third.js [test] (ecmascript)");
    });
});
}),
];

//# sourceMappingURL=1jsg_tests_snapshot_basic_nested_async_availability_input_0xj39htr4y5yc._.js.map