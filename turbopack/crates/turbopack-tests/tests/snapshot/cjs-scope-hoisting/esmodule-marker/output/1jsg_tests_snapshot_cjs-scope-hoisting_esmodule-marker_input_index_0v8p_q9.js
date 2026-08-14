(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-scope-hoisting_esmodule-marker_input_index_0v8p_q9.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/esmodule-marker/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var _greeting;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/esmodule-marker/input/index.js [test] (ecmascript)
;
var _greet;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/esmodule-marker/input/dep.js [test] (ecmascript)
;
// The shape every TypeScript-compiled CommonJS module has. The `__esModule`
// marker writes to `exports`, which a merged module has no binding for, so the
// merge has to drop the call rather than emit it.
0;
function greet(name) {
    return 'hi ' + name;
}
_greet = greet;
__turbopack_context__.v({
    greet: _greet
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/esmodule-marker/input/dep.js [test] (ecmascript)");
const { greet: greet1 } = {
    greet: _greet
};
_greeting = greet1('world');
__turbopack_context__.v({
    greeting: _greeting
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/esmodule-marker/input/index.js [test] (ecmascript)");
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-scope-hoisting_esmodule-marker_input_index_0v8p_q9.js.map