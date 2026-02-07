(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/aaf3a_crates_turbopack-tests_tests_snapshot_imports_ignore-comments_input_1f8151c3._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = 'turbopack';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs (static in ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.q("/static/vercel.242d4ff2.cjs");}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript, worker loader)", ((__turbopack_context__) => {

__turbopack_context__.v(function(Ctor, opts) {
    return __turbopack_context__.b(Ctor, "output/6642e_crates_turbopack-tests_tests_snapshot_imports_ignore-comments_output_664a0dec._.js", ["output/bf321_tests_snapshot_imports_ignore-comments_input_vercel_cjs_422a38f6._.js","output/ad3e4_tests_snapshot_imports_ignore-comments_input_vercel_cjs_6f11dd5d._.js"], opts);
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.q("/static/ignore-worker.481250f3.cjs");}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "foo",
    ()=>foo
]);
const __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/index.js")}`;
    }
};
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.mjs [test] (ecmascript, async loader)").then(console.log);
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.mjs [test] (ecmascript, async loader)").then(console.log);
console.log(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript)"));
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript, worker loader)")(Worker);
// turbopack shouldn't attempt to bundle these, and they should be preserved in the output
import(/* webpackIgnore: true */ './ignore.mjs');
import(/* turbopackIgnore: true */ './ignore.mjs');
// this should work for cjs requires too
require(/* webpackIgnore: true */ './ignore.cjs');
require(/* turbopackIgnore: true */ './ignore.cjs');
new Worker(new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)")));
new Worker(new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)")));
function foo(plugin) {
    return require(/* turbopackIgnore: true */ plugin);
}
}),
]);

//# sourceMappingURL=aaf3a_crates_turbopack-tests_tests_snapshot_imports_ignore-comments_input_1f8151c3._.js.map