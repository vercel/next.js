(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/aaf3a_crates_turbopack-tests_tests_snapshot_imports_optional-comments_input_aa975693._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/optional-comments/input/existing.cjs [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = 'existing module (cjs)';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/optional-comments/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

// turbopackOptional should suppress resolve errors silently
Promise.resolve().then(()=>{
    const e = new Error("Cannot find module './missing.mjs'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
}).then((m)=>console.log(m), (e)=>console.log('missing.mjs not found'));
// require with turbopackOptional should also work
try {
    const missing = (()=>{
        const e = new Error("Cannot find module './missing.cjs'");
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    })();
    console.log(missing);
} catch (e) {
    console.log('missing.cjs not found');
}
// webpackOptional is NOT supported, so this should NOT suppress the error
Promise.resolve().then(()=>{
    const e = new Error("Cannot find module './missing-should-error-webpack.mjs'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
});
// turbopackOptional: false should still produce errors
Promise.resolve().then(()=>{
    const e = new Error("Cannot find module './missing-should-error-optional-false.mjs'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
});
// Default behavior without any optional comment should produce errors
Promise.resolve().then(()=>{
    const e = new Error("Cannot find module './missing-should-error-default.mjs'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
});
// Test with existing module - should work normally
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/optional-comments/input/existing.mjs [test] (ecmascript, async loader)").then((m)=>console.log(m));
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/optional-comments/input/existing.cjs [test] (ecmascript)");
}),
]);

//# sourceMappingURL=aaf3a_crates_turbopack-tests_tests_snapshot_imports_optional-comments_input_aa975693._.js.map