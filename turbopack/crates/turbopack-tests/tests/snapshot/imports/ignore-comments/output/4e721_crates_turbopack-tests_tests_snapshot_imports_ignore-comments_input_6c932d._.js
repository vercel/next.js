(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/4e721_crates_turbopack-tests_tests_snapshot_imports_ignore-comments_input_6c932d._.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript)": (function(__turbopack_context__) {

var { g: global, d: __dirname, m: module, e: exports } = __turbopack_context__;
{
module.exports = "turbopack";
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs (static)": ((__turbopack_context__) => {

var { g: global, d: __dirname } = __turbopack_context__;
{
__turbopack_context__.v("/static/vercel.5cd99b11.cjs");}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript, worker loader)": ((__turbopack_context__) => {

var { g: global, d: __dirname } = __turbopack_context__;
{
__turbopack_context__.v(__turbopack_context__.b([
  "output/b1abf_turbopack-tests_tests_snapshot_imports_ignore-comments_input_vercel_cjs_1ec8d7._.js",
  "output/61784_tests_snapshot_imports_ignore-comments_input_vercel_cjs_75b6e3___ad9094.js"
]));
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/index.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, d: __dirname } = __turbopack_context__;
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
// and for workers
new Worker(/* webpackIgnore: true */ "./ignore.mjs");
new Worker(/* turbopackIgnore: true */ "./ignore.cjs");
function foo(plugin) {
    return require(/* turbopackIgnore: true */ plugin);
}
}}),
}]);

//# sourceMappingURL=4e721_crates_turbopack-tests_tests_snapshot_imports_ignore-comments_input_6c932d._.js.map