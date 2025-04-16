(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/4e721_crates_turbopack-tests_tests_snapshot_imports_require-context_input_b0375d60._.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/foo.js [test] (ecmascript)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
(function() {
    throw new Error();
})();
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/index.js (require.context ./deps/**)": ((__turbopack_context__) => {

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.v({
    "./foo.js": {
        id: ()=>"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/foo.js [test] (ecmascript)",
        module: ()=>__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/foo.js [test] (ecmascript)")
    }
});
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/index.js [test] (ecmascript)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
// PACK-3895: ensure that negative lookaround works.
let ctx = __turbopack_context__.f(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/index.js (require.context ./deps/**)"));
// import all the matches, should just get foo.js
ctx.keys().forEach(ctx);
}}),
}]);

//# sourceMappingURL=4e721_crates_turbopack-tests_tests_snapshot_imports_require-context_input_b0375d60._.js.map