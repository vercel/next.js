(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/1jsg_tests_snapshot_scope-hoisting_import-meta-glob_input_index_1fxkqkb82hzw0.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-meta-glob/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-meta-glob/input/index.js [test] (ecmascript)");
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-meta-glob/input/index.js [test] (ecmascript)
;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-meta-glob/input/index.js.import-meta-glob.mjs [test] (import.meta.glob ./dir/*.js eager import=value, ecmascript)
;
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-meta-glob/input/dir/a.js [test] (ecmascript)
;
const value = 'a';
// MERGED MODULE: [project]/turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-meta-glob/input/dir/b.js [test] (ecmascript)
;
const value1 = 'b';
;
;
const __TURBOPACK__default__export__ = {
    "./dir/a.js": value,
    "./dir/b.js": value1
};
var __TURBOPACK__import$2e$meta__ = {
    get url () {
        return __turbopack_context__.F("turbopack/crates/turbopack-tests/tests/snapshot/scope-hoisting/import-meta-glob/input/index.js");
    },
    env: {
        DEV: true,
        PROD: false,
        MODE: "development",
        BASE_URL: "/",
        SSR: false
    }
};
// Eager matches are static imports of a synthetic module, so scope hoisting can
// merge the synthetic module and the matches into the importing module.
const modules = __TURBOPACK__default__export__;
console.log(modules);
;
}),
]);

//# sourceMappingURL=1jsg_tests_snapshot_scope-hoisting_import-meta-glob_input_index_1fxkqkb82hzw0.js.map