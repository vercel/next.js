(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/1jsg_tests_snapshot_scope-hoisting_import-cycle-entry_input_00t8flqezrr4c._.js","[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/lazy.js [test] (ecmascript)",((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "load",
    ()=>load
]);
const load = ()=>__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/page.js [test] (ecmascript, async loader)");
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/index.js [test] (ecmascript)",((__turbopack_context__, module, exports) => {

// `page.js` and `left.js` are targets of an `import()`, and each is part of a cycle of imports.
// `shared1.js` and `shared2.js` are merged: no cycle holds them, and no `require()` loads an
// entry that imports them (`lazy.js` is required, but its `import()` evaluates `page.js` later).
// `left.js` and `right.js` are not merged: `other.js` imports both. `leaf.js` is merged with
// `right.js`, the only module that imports it.
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/other.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other.v()));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/page.js [test] (ecmascript, async loader)").then(({ page })=>console.log(page.v()));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/left.js [test] (ecmascript, async loader)").then(({ left })=>console.log(left()));
globalThis.lazy = ()=>__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/lazy.js [test] (ecmascript)");
})]);

//# sourceMappingURL=1jsg_tests_snapshot_scope-hoisting_import-cycle-entry_input_00t8flqezrr4c._.js.map