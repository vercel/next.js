(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0p5q_snapshot_cjs-remove-unused-exports_require-binding-destructure_input_0s_d9tj._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding-destructure/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// `lib` is only read through an object pattern, so `exports.unused` in lib.js
// should drop just as it does for `const { used } = require('./lib.js')`.
const lib = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding-destructure/input/lib.js [test] (ecmascript)");
const { used } = lib;
console.log(used);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding-destructure/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

exports.used = 'used-value';
'unused-value';
}),
]);

//# sourceMappingURL=0p5q_snapshot_cjs-remove-unused-exports_require-binding-destructure_input_0s_d9tj._.js.map