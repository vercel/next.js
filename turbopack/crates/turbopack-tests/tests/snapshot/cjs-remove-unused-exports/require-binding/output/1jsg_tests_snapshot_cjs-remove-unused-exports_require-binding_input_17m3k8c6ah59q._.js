(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-remove-unused-exports_require-binding_input_17m3k8c6ah59q._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// `lib` is only ever read via `.used`, so `exports.unused` in lib.js should drop.
const lib = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding/input/lib.js [test] (ecmascript)");
console.log(lib.used);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

exports.used = 'used-value';
'unused-value';
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-remove-unused-exports_require-binding_input_17m3k8c6ah59q._.js.map