(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-scope-hoisting_require-shapes-tree-shaking_input_1po-sz2._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var _total, _doubled, _message;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/index.js [test] (ecmascript)
;
var _add, _PI, _unused;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/math.js [test] (ecmascript)
;
_add = (a, b)=>a + b;
_PI = 3.14;
_unused = 'not referenced';
__turbopack_context__.v({
    add: _add,
    PI: _PI,
    unused: _unused
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/math.js [test] (ecmascript)");
// Destructured require: only `add` and `PI` are read.
const { add: add1, PI: PI1 } = {
    add: _add,
    PI: _PI
};
var _value, _double, _triple;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/dep.js [test] (ecmascript)
;
const base = 21;
_value = base * 2;
_double = (n)=>n * 2;
_triple = (n)=>n * 3;
__turbopack_context__.v({
    value: _value,
    double: _double,
    triple: _triple
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/dep.js [test] (ecmascript)");
// Namespace require: the whole exports object is bound.
const dep = {
    value: _value,
    double: _double
};
// Member call on the require result: not a top-level hoistable path, so this
// keeps a runtime require.
const greeting = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/util.js [test] (ecmascript)").greet('world');
var _ran;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/side.js [test] (ecmascript)
;
globalThis.__sideEffectRan = true;
_ran = true;
_total = add1(PI1, dep.value);
_doubled = dep.double(21);
_message = greeting;
__turbopack_context__.v({
    total: _total,
    doubled: _doubled,
    message: _message
}, "[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/index.js [test] (ecmascript)");
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-scope-hoisting/require-shapes-tree-shaking/input/util.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

exports.greet = (name)=>`hi ${name}`;
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-scope-hoisting_require-shapes-tree-shaking_input_1po-sz2._.js.map