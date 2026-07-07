(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1do3_crates_turbopack-tests_tests_snapshot_basic_single-chunk-entry_input_0085tus._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/single-chunk-entry/input/dep1.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// `dep1` is reached via `import('./dep1')` and itself dynamically imports
// `dep2` — exercising a nested dynamic-import boundary that must also inline.
__turbopack_context__.s([
    "dep1",
    ()=>dep1
]);
function dep1() {
    console.log('dep1');
    Promise.resolve().then(()=>__turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/single-chunk-entry/input/dep2.js [test] (ecmascript)")).then(({ dep2 })=>{
        dep2();
    });
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/single-chunk-entry/input/dep2.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Leaf module reached via the nested `import('./dep2')`.
__turbopack_context__.s([
    "dep2",
    ()=>dep2
]);
function dep2() {
    console.log('dep2');
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/single-chunk-entry/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// Service-worker-style entry: the whole transitive closure (including the
// dynamic `import()` targets) must be inlined into a single output file.
console.log('service worker entry');
Promise.resolve().then(()=>__turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/single-chunk-entry/input/dep1.js [test] (ecmascript)")).then(({ dep1 })=>{
    dep1();
});
}),
]);(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([
    "output/1i9t_crates_turbopack-tests_tests_snapshot_basic_single-chunk-entry_input_1gjyv-z._.js",
    {"otherChunks":[],"runtimeModuleIds":["[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/single-chunk-entry/input/index.js [test] (ecmascript)"]}
]);
// Dummy runtime


//# sourceMappingURL=index.entry.js.map