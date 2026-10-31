(()=>{"use strict";(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0_9x_turbopack-tests_tests_snapshot_scope-hoisting_direct-eval_input_1oxos4-8yb8iv._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/direct-eval/input/direct.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "direct",
    ()=>direct
]);
const local = 'direct';
function nested() {
    // A direct eval can reference module bindings by name, so this module must
    // not be merged (merging may rename `local`).
    // prettier-ignore
    return eval('local');
}
const direct = eval('local') + nested();
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/direct-eval/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/direct-eval/input/index.js [test] (ecmascript)");
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/direct-eval/input/index.js [test] (ecmascript)
;
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$scope$2d$hoisting$2f$direct$2d$eval$2f$input$2f$direct$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/direct-eval/input/direct.js [test] (ecmascript)");
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/direct-eval/input/indirect.js [test] (ecmascript)
;
const local = 'indirect';
const indirect = [
    (0, eval)('1'),
    globalThis.eval('2'),
    eval?.('3'),
    local
];
;
;
const local1 = 'index';
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$scope$2d$hoisting$2f$direct$2d$eval$2f$input$2f$direct$2e$js__$5b$test$5d$__$28$ecmascript$29$__["direct"], indirect, local1);
}),
]);})()

//# sourceMappingURL=0_9x_turbopack-tests_tests_snapshot_scope-hoisting_direct-eval_input_1oxos4-8yb8iv._.js.map