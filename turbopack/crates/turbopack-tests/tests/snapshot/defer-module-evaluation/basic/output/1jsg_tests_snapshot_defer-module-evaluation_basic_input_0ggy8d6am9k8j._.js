(()=>{"use strict";module.exports=["[project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/index.js [test] (ecmascript)",((__turbopack_context__) => {


// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/index.js [test] (ecmascript)
;
var __TURBOPACK__deferred__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$defer$2d$module$2d$evaluation$2f$basic$2f$input$2f$library$2f$deferred$2e$js__$5b$test$5d$__$28$ecmascript$29$__;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/read-at-evaluation.js [test] (ecmascript)
;
const eager = 'eager';
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/effect.js [test] (ecmascript)
;
console.log('effect');
function effect() {
    return 'effect';
}
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/mixed-eager-first.js [test] (ecmascript)
;
const atEvaluation = 'at evaluation';
const inFunction = 'in function';
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/mixed-deferrable-first.js [test] (ecmascript)
;
const inFunctionFirst = 'in function';
const atEvaluationSecond = 'at evaluation';
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/whole-namespace.js [test] (ecmascript)
;
const member = 'member';
__turbopack_context__.s([
    "member",
    0,
    member
], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/whole-namespace.js [test] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$defer$2d$module$2d$evaluation$2f$basic$2f$input$2f$library$2f$whole$2d$namespace$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/whole-namespace.js [test] (ecmascript)");
;
;
;
;
;
;
// Read while this module is evaluated: imported eagerly.
console.log(eager);
function run() {
    return [
        (0, (__TURBOPACK__deferred__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$defer$2d$module$2d$evaluation$2f$basic$2f$input$2f$library$2f$deferred$2e$js__$5b$test$5d$__$28$ecmascript$29$__ || (__TURBOPACK__deferred__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$defer$2d$module$2d$evaluation$2f$basic$2f$input$2f$library$2f$deferred$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.d("[project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/deferred.js [test] (ecmascript)")))["deferred"])(),
        (__TURBOPACK__deferred__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$defer$2d$module$2d$evaluation$2f$basic$2f$input$2f$library$2f$deferred$2e$js__$5b$test$5d$__$28$ecmascript$29$__ || (__TURBOPACK__deferred__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$defer$2d$module$2d$evaluation$2f$basic$2f$input$2f$library$2f$deferred$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.d("[project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/deferred.js [test] (ecmascript)")))["value"],
        effect()
    ];
}
// One import of each of these two modules is read while this module is evaluated. That evaluates
// the module, so the import that is only read inside a function is not deferred either, and the
// modules stay merged.
console.log(atEvaluation, atEvaluationSecond);
function mixed() {
    return [
        inFunction,
        inFunctionFirst
    ];
}
function namespace() {
    return Object.keys(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$defer$2d$module$2d$evaluation$2f$basic$2f$input$2f$library$2f$whole$2d$namespace$2e$js__$5b$test$5d$__$28$ecmascript$29$__);
}
__turbopack_context__.s([
    "mixed",
    0,
    mixed,
    "namespace",
    0,
    namespace,
    "run",
    0,
    run
], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/index.js [test] (ecmascript)");
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/defer-module-evaluation/basic/input/library/deferred.js [test] (ecmascript)",((__turbopack_context__) => {


function deferred() {
    return 'deferred';
}
const value = 'value';
__turbopack_context__.s([
    "deferred",
    0,
    deferred,
    "value",
    0,
    value
]);
})];})()

//# sourceMappingURL=1jsg_tests_snapshot_defer-module-evaluation_basic_input_0ggy8d6am9k8j._.js.map