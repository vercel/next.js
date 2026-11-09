(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/1jsg_tests_snapshot_scope-hoisting_import-cycle-entry_input_00qvtwlzazo17._.js",(()=>{"use strict";return["[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/lazy.js [test] (ecmascript)",((__turbopack_context__) => {


__turbopack_context__.s([
    "load",
    ()=>load
]);
const load = ()=>__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/page.js [test] (ecmascript, async loader)");
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/plain1.js [test] (ecmascript)","[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/plain2.js [test] (ecmascript)", 
((__turbopack_context__) => {


__turbopack_context__.s([
    "plain2",
    ()=>plain2
], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/plain2.js [test] (ecmascript)");
__turbopack_context__.s([
    "plain1",
    ()=>plain1
], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/plain1.js [test] (ecmascript)");
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/plain1.js [test] (ecmascript)
;
console.log('plain1');
const plain1 = 'plain1';
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/plain2.js [test] (ecmascript)
;
console.log('plain2');
const plain2 = 'plain2';
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/required.js [test] (ecmascript)",((__turbopack_context__) => {


__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$scope$2d$hoisting$2f$import$2d$cycle$2d$entry$2f$input$2f$plain1$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/plain1.js [test] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$scope$2d$hoisting$2f$import$2d$cycle$2d$entry$2f$input$2f$plain2$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/plain2.js [test] (ecmascript)");
;
;
console.log('required', __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$scope$2d$hoisting$2f$import$2d$cycle$2d$entry$2f$input$2f$plain1$2e$js__$5b$test$5d$__$28$ecmascript$29$__["plain1"], __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$scope$2d$hoisting$2f$import$2d$cycle$2d$entry$2f$input$2f$plain2$2e$js__$5b$test$5d$__$28$ecmascript$29$__["plain2"]);
})]})(),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/index.js [test] (ecmascript)",((__turbopack_context__, module, exports) => {

// `page.js` and `left.js` are targets of an `import()`, and each is part of a cycle of imports.
// `shared1.js` and `shared2.js` are merged: no cycle holds them, and no `require()` loads an
// entry that imports them (`lazy.js` is required, but its `import()` evaluates `page.js` later).
// `left.js` and `right.js` are not merged: `other.js` imports both. `leaf.js` is merged with
// `right.js`, the only module that imports it.
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/other.js [test] (ecmascript, async loader)").then(({ other })=>console.log(other.v()));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/page.js [test] (ecmascript, async loader)").then(({ page })=>console.log(page.v()));
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/left.js [test] (ecmascript, async loader)").then(({ left })=>console.log(left()));
globalThis.lazy = ()=>__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/lazy.js [test] (ecmascript)");
// `plain1.js` and `plain2.js` are merged with two ways in. `required.js` is required and imports
// both, like `second.js`, but no entry that imports them is part of a cycle.
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/second.js [test] (ecmascript, async loader)");
globalThis.required = ()=>__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-cycle-entry/input/required.js [test] (ecmascript)");
})]);

//# sourceMappingURL=1jsg_tests_snapshot_scope-hoisting_import-cycle-entry_input_00qvtwlzazo17._.js.map