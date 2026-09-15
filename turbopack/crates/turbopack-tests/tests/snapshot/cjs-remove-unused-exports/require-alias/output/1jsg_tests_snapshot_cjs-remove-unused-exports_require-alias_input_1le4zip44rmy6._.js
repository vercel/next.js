(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_cjs-remove-unused-exports_require-alias_input_1le4zip44rmy6._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-alias/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// `require` is aliased, so the require-usage analysis can't recognize the call.
// No usage is recorded for it, which must fail open: lib.js keeps *all* its
// exports (including `unused`) rather than being narrowed to just `.used`.
const myRequire = /*TURBOPACK member replacement*/ __turbopack_context__.t;
console.log(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-alias/input/lib.js [test] (ecmascript)").used);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-exports/require-alias/input/lib.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

exports.used = 'used-value';
exports.unused = 'unused-value';
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_cjs-remove-unused-exports_require-alias_input_1le4zip44rmy6._.js.map