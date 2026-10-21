(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0_9x_turbopack-tests_tests_snapshot_imports_import-meta-glob_input_1y3wc3yelnum2._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/eager/c.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
const __TURBOPACK__default__export__ = 'eager c';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

var __TURBOPACK__import$2e$meta__ = {
    get url () {
        return __turbopack_context__.F("turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js");
    },
    env: {
        DEV: true,
        PROD: false,
        MODE: "development",
        BASE_URL: "/",
        SSR: false
    }
};
// Lazy matches are loaded on demand, so each one is split into its own async chunk.
const lazy = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js [test] (import.meta.glob ./lazy/*.js)");
// Eager matches are evaluated synchronously, so they stay in the entry chunk.
const eager = __turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js [test] (import.meta.glob ./eager/*.js eager)");
console.log(eager);
lazy['./lazy/a.js']().then(console.log);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js [test] (import.meta.glob ./eager/*.js eager)", (function(__turbopack_context__){

__turbopack_context__.v({
    "./eager/c.js": __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/eager/c.js [test] (ecmascript)")
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js [test] (import.meta.glob ./lazy/*.js)", (function(__turbopack_context__){

__turbopack_context__.v({
    "./lazy/a.js": ()=>__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/lazy/a.js [test] (ecmascript, async loader)"),
    "./lazy/b.js": ()=>__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/lazy/b.js [test] (ecmascript, async loader)")
});
}),
]);

//# sourceMappingURL=0_9x_turbopack-tests_tests_snapshot_imports_import-meta-glob_input_1y3wc3yelnum2._.js.map