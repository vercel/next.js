(()=>{"use strict";(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0_9x_turbopack-tests_tests_snapshot_imports_namespace-call-arrow_input_1a2yx4tbrus09._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/namespace-call-arrow/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$namespace$2d$call$2d$arrow$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/namespace-call-arrow/input/lib.js [test] (ecmascript)");
var /*#__PURE__*/ { "arrowFn": __TURBOPACK__imported__binding__arrowFn__e5aaa98cf2086648__, "plainFn": __TURBOPACK__imported__binding__plainFn__ac891104a46ee62f__, "classFn": __TURBOPACK__imported__binding__classFn__045e3cba4a8c928e__ } = __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$namespace$2d$call$2d$arrow$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__;
;
console.log(__TURBOPACK__imported__binding__arrowFn__e5aaa98cf2086648__(1), __TURBOPACK__imported__binding__plainFn__ac891104a46ee62f__(2), __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$namespace$2d$call$2d$arrow$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__["methodLike"](), __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$namespace$2d$call$2d$arrow$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__["evalFn"](), __TURBOPACK__imported__binding__classFn__045e3cba4a8c928e__());
__turbopack_context__.s([]);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/namespace-call-arrow/input/lib.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// An arrow has no `this` of its own, so calling it through the namespace does not need the
// namespace as a receiver.
const arrowFn = (x)=>x * 2;
function plainFn(x) {
    return x + 1;
}
function methodLike() {
    return this === undefined ? 'no-this' : 'has-this';
}
function evalFn() {
    return eval('this');
}
function classFn() {
    class Inner {
        field = this;
        static{
            this.tag = 'tag';
        }
        m() {
            return this.x;
        }
    }
    return Inner;
}
__turbopack_context__.s([
    "arrowFn",
    0,
    arrowFn,
    "classFn",
    0,
    classFn,
    "evalFn",
    0,
    evalFn,
    "methodLike",
    0,
    methodLike,
    "plainFn",
    0,
    plainFn
]);
}),
]);})()

//# sourceMappingURL=0_9x_turbopack-tests_tests_snapshot_imports_namespace-call-arrow_input_1a2yx4tbrus09._.js.map