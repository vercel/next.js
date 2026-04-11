(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/turbopack_crates_turbopack-tests_tests_snapshot_import-meta_glob_input_1g_rayi._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/bar.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>bar,
    "name",
    ()=>name
]);
const name = 'bar';
function bar() {
    return 'bar';
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/foo.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>foo,
    "name",
    ()=>name
]);
const name = 'foo';
function foo() {
    return 'foo';
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js)", (function(__turbopack_context__){

__turbopack_context__.v({
    "./dir/bar.js": ()=>Promise.resolve().then(()=>__turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/bar.js [test] (ecmascript)")),
    "./dir/foo.js": ()=>Promise.resolve().then(()=>__turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/foo.js [test] (ecmascript)"))
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js eager)", (function(__turbopack_context__){

__turbopack_context__.v({
    "./dir/bar.js": __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/bar.js [test] (ecmascript)"),
    "./dir/foo.js": __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/foo.js [test] (ecmascript)")
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js eager import=default)", (function(__turbopack_context__){

__turbopack_context__.v({
    "./dir/bar.js": __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/bar.js [test] (ecmascript)")["default"],
    "./dir/foo.js": __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/foo.js [test] (ecmascript)")["default"]
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js, !**/bar.js eager)", (function(__turbopack_context__){

__turbopack_context__.v({
    "./dir/foo.js": __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/foo.js [test] (ecmascript)")
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/other/baz.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>baz,
    "name",
    ()=>name
]);
const name = 'baz';
function baz() {
    return 'baz';
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js, ./other/*.js eager)", (function(__turbopack_context__){

__turbopack_context__.v({
    "./dir/bar.js": __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/bar.js [test] (ecmascript)"),
    "./dir/foo.js": __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/dir/foo.js [test] (ecmascript)"),
    "./other/baz.js": __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/other/baz.js [test] (ecmascript)")
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

var __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js")}`;
    }
};
// Lazy glob (default)
const lazyModules = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js)");
// Eager glob
const eagerModules = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js eager)");
// Named import
const defaultExports = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js eager import=default)");
// Negative pattern (exclude bar.js)
const filtered = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js, !**/bar.js eager)");
// Multiple patterns
const multi = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob/input/index.js (import.meta.glob ./dir/*.js, ./other/*.js eager)");
console.log(lazyModules, eagerModules, defaultExports, filtered, multi);
}),
]);

//# sourceMappingURL=turbopack_crates_turbopack-tests_tests_snapshot_import-meta_glob_input_1g_rayi._.js.map