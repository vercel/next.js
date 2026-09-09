(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0p5q_snapshot_cjs-remove-unused-exports_require-binding-escape_input_0cyfb_1d-bgxt._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding-escape/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

const lib = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding-escape/input/lib.js [test] (ecmascript)");
console.log(lib.used);
// `lib` also escapes wholesale, so the whole namespace is observable and
// nothing may be dropped.
globalThis.leaked = lib;
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-binding-escape/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

exports.used = 'used-value';
exports.unused = 'unused-value';
}),
]);

//# sourceMappingURL=0p5q_snapshot_cjs-remove-unused-exports_require-binding-escape_input_0cyfb_1d-bgxt._.js.map