(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/1jsg_tests_snapshot_source_maps_scopes-merged_input_index_019herzwyjtj1.js","[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes-merged/input/index.js [test] (ecmascript)",((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Calculator",
    ()=>Calculator,
    "arrow",
    ()=>arrow
], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes-merged/input/index.js [test] (ecmascript)");
__turbopack_context__.s([
    "answer",
    ()=>answer,
    "default",
    ()=>greet,
    "helper",
    ()=>helper
], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes-merged/input/dep.js [test] (ecmascript)");
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes-merged/input/index.js [test] (ecmascript)
;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes-merged/input/dep.js [test] (ecmascript)
;
function helper(value) {
    return value * 2;
}
const answer = 42;
function greet(name) {
    return `Hello ${name}`;
}
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2d$merged$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes-merged/input/dep.js [test] (ecmascript)");
;
;
;
const prefix = 'result';
function compute(first, { second }) {
    let total = helper(first) + second;
    {
        const doubled = total * 2;
        try {
            total = doubled + answer;
        } catch (err) {
            console.error(err);
        }
    }
    return function inner(extra) {
        return total + extra + __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2d$merged$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__.answer;
    };
}
class Calculator {
    run(input) {
        return compute(input, {
            second: 1
        })(2);
    }
}
const arrow = (x)=>x + 1;
console.log(prefix, greet('world'), new Calculator().run(3), arrow(1), __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2d$merged$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__);
})]);

//# sourceMappingURL=1jsg_tests_snapshot_source_maps_scopes-merged_input_index_019herzwyjtj1.js.map