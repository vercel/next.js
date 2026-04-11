(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0_9x_turbopack-tests_tests_snapshot_import-meta_glob-error_input_index_1he8gm_.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob-error/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

var __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("turbopack/crates/turbopack-tests/tests/snapshot/import-meta/glob-error/input/index.js")}`;
    }
};
// Error: 'as' option is not supported
const withAs = __TURBOPACK__import$2e$meta__.glob('./dir/*.js', {
    as: 'raw'
});
// Error: non-constant eager
const nonConstEager = __TURBOPACK__import$2e$meta__.glob('./dir/*.js', {
    eager: someVar
});
// Error: unknown option
const unknown = __TURBOPACK__import$2e$meta__.glob('./dir/*.js', {
    exhaust: true
});
console.log(withAs, nonConstEager, unknown);
}),
]);

//# sourceMappingURL=0_9x_turbopack-tests_tests_snapshot_import-meta_glob-error_input_index_1he8gm_.js.map