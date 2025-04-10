(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/4e721_crates_turbopack-tests_tests_snapshot_imports_ignore-comments_input_7f940ff3._.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
module.exports = "turbopack";
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs (static in ecmascript)": ((__turbopack_context__) => {

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.v("/static/vercel.5cd99b11.cjs");}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript, worker loader)": ((__turbopack_context__) => {

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.v(__turbopack_context__.b([
  "output/4c35f_tests_snapshot_imports_ignore-comments_input_vercel_cjs_1ec8d7d5._.js",
  "output/4c35f_tests_snapshot_imports_ignore-comments_input_vercel_cjs_3041f295._.js"
]));
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)": ((__turbopack_context__) => {

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.v("/static/ignore-worker.c7cb9893.cjs");}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/index.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "foo": (()=>foo)
});
const __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/index.js")}`;
    }
};
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.mjs [test] (ecmascript, async loader)")(__turbopack_context__.i).then(console.log);
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.mjs [test] (ecmascript, async loader)")(__turbopack_context__.i).then(console.log);
console.log(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript)"));
new Worker(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript, worker loader)"));
// turbopack shouldn't attempt to bundle these, and they should be preserved in the output
import(/* webpackIgnore: true */ "./ignore.mjs");
import(/* turbopackIgnore: true */ "./ignore.mjs");
// this should work for cjs requires too
require(/* webpackIgnore: true */ "./ignore.cjs");
require(/* turbopackIgnore: true */ "./ignore.cjs");
new Worker(new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)")));
new Worker(new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)")));
function foo(plugin) {
    return require(/* turbopackIgnore: true */ plugin);
}
}}),
}]);

//# sourceMappingURL=4e721_crates_turbopack-tests_tests_snapshot_imports_ignore-comments_input_7f940ff3._.js.map