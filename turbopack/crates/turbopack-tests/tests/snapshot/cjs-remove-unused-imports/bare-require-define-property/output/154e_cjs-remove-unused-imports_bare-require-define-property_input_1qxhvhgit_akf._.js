(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/154e_cjs-remove-unused-imports_bare-require-define-property_input_1qxhvhgit_akf._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-imports/bare-require-define-property/input/defineprop-foreign.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// A foreign target is observable, so this require is kept.
Object.defineProperty(globalThis, 'x', {
    value: 1
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-imports/bare-require-define-property/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// A discarded require becomes `0` when its target is side-effect free.
0;
0;
0;
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/cjs-remove-unused-imports/bare-require-define-property/input/defineprop-foreign.js [test] (ecmascript)");
console.log('kept');
}),
]);

//# sourceMappingURL=154e_cjs-remove-unused-imports_bare-require-define-property_input_1qxhvhgit_akf._.js.map