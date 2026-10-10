(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0p5q_snapshot_cjs-remove-unused-exports_require-destructure_input_12ec97sl6i8yk._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-destructure/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// Only `used` is destructured from the require result, so `exports.unused` in
// lib.js should be dropped.
const { used } = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-destructure/input/lib.js [test] (ecmascript)");
console.log(used);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-destructure/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

exports.used = 'used-value';
'unused-value';
}),
]);

//# sourceMappingURL=0p5q_snapshot_cjs-remove-unused-exports_require-destructure_input_12ec97sl6i8yk._.js.map