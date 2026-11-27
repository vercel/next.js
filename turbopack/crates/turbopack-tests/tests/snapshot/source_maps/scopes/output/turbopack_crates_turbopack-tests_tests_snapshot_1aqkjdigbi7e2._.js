(()=>{"use strict";(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/turbopack_crates_turbopack-tests_tests_snapshot_1aqkjdigbi7e2._.js","[project]/turbopack/crates/turbopack-tests/tests/snapshot/node_modules/react/jsx-dev-runtime.js [test] (ecmascript)",((__turbopack_context__) => {


__turbopack_context__.s([
    "jsxDEV",
    ()=>jsxDEV
]);
function jsxDEV() {
    return 'purposefully empty stub for react/jsx-dev-runtime.js';
}
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes/input/component.jsx [test] (ecmascript)",((__turbopack_context__) => {


__turbopack_context__.s([
    "Component",
    ()=>Component
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/node_modules/react/jsx-dev-runtime.js [test] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes/input/dep.js [test] (ecmascript)");
;
;
function Component({ value }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$test$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__["helper"])(value)
    }, void 0, false, {
        fileName: "[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes/input/component.jsx",
        lineNumber: 4,
        columnNumber: 10
    }, this);
}
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes/input/dep.js [test] (ecmascript)",((__turbopack_context__) => {


__turbopack_context__.s([
    "answer",
    ()=>answer,
    "default",
    ()=>greet,
    "helper",
    ()=>helper
]);
function helper(value) {
    return value * 2;
}
const answer = 42;
function greet(name) {
    return `Hello ${name}`;
}
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes/input/index.js [test] (ecmascript)",((__turbopack_context__) => {


__turbopack_context__.s([
    "Calculator",
    ()=>Calculator,
    "arrow",
    ()=>arrow
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes/input/dep.js [test] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$component$2e$jsx__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/source_maps/scopes/input/component.jsx [test] (ecmascript)");
;
;
;
const prefix = 'result';
function compute(first, { second }) {
    let total = (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__["helper"])(first) + second;
    {
        const doubled = total * 2;
        try {
            total = doubled + __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__["answer"];
        } catch (err) {
            console.error(err);
        }
    }
    return function inner(extra) {
        return total + extra + __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__.answer;
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
console.log(prefix, (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__["default"])('world'), new Calculator().run(3), arrow(1), __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__);
;
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$2f$component$2e$jsx__$5b$test$5d$__$28$ecmascript$29$__["Component"]);
})]);})()

//# sourceMappingURL=turbopack_crates_turbopack-tests_tests_snapshot_1aqkjdigbi7e2._.js.map