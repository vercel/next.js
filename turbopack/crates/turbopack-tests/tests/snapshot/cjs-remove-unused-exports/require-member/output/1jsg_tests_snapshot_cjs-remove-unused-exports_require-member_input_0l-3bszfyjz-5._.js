(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-remove-unused-exports_require-member_input_0l-3bszfyjz-5._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-member/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// Only `.used` is read off the require result, so `exports.unused` in lib.js
// should be dropped.
console.log(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-member/input/lib.js [test] (ecmascript)").used);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-member/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

exports.used = 'used-value';
'unused-value';
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-remove-unused-exports_require-member_input_0l-3bszfyjz-5._.js.map