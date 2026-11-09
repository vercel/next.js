(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/1jsg_tests_snapshot_scope-hoisting_import-cycle-entry_input_index_1o3mp_rz7dlp-.js","[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/index.js [test] (ecmascript)",((__turbopack_context__, module, exports) => {

// `page.js` and `left.js` are targets of an `import()`, and each is part of a cycle of imports.
// `shared1.js` and `shared2.js` are merged: no cycle holds them. `left.js` and `right.js` are
// not: `other.js` imports both.
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/other.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other.v()));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/page.js [test] (ecmascript, async loader)").then(({ page })=>console.log(page.v()));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/left.js [test] (ecmascript, async loader)").then(({ left })=>console.log(left()));
})]);

//# sourceMappingURL=1jsg_tests_snapshot_scope-hoisting_import-cycle-entry_input_index_1o3mp_rz7dlp-.js.map