(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0_9x_turbopack-tests_tests_snapshot_imports_require-context_input_0ign_s6ykdofv._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/a.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = 'a';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/b.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = 'b';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

const ctx = __turbopack_context__.f(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/index.js.require-context.cjs [test] (require.context ./deps/* /\\.js$/, ecmascript)"));
console.log(ctx.keys().map((key)=>ctx(key)));
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/index.js.require-context.cjs [test] (require.context ./deps/* /\\.js$/, ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "./a.js": {
        id: ()=>"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/a.js [test] (ecmascript)",
        module: ()=>__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/a.js [test] (ecmascript)")
    },
    "./b.js": {
        id: ()=>"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/b.js [test] (ecmascript)",
        module: ()=>__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/require-context/input/deps/b.js [test] (ecmascript)")
    }
};
}),
]);

//# sourceMappingURL=0_9x_turbopack-tests_tests_snapshot_imports_require-context_input_0ign_s6ykdofv._.js.map