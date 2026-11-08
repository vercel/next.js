(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/0_9x_turbopack-tests_tests_snapshot_imports_import-meta-glob_input_15ktvkpdyzw0c._.js",
(()=>{"use strict";return[
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/eager/c.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
const __TURBOPACK__default__export__ = 'eager c';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js.import-meta-glob.mjs [test] (import.meta.glob ./eager/*.js eager, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$meta$2d$glob$2f$input$2f$eager$2f$c$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/eager/c.js [test] (ecmascript)");
;
const __TURBOPACK__default__export__ = {
    "./eager/c.js": __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$meta$2d$glob$2f$input$2f$eager$2f$c$2e$js__$5b$test$5d$__$28$ecmascript$29$__
};
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js.import-meta-glob.mjs [test] (import.meta.glob ./lazy/*.js, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
const __TURBOPACK__default__export__ = {
    "./lazy/a.js": ()=>__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/lazy/a.js [test] (ecmascript, async loader)"),
    "./lazy/b.js": ()=>__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/lazy/b.js [test] (ecmascript, async loader)")
};
}),
]})(),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$meta$2d$glob$2f$input$2f$index$2e$js$2e$import$2d$meta$2d$glob$2e$mjs__$5b$test$5d$__$28$import$2e$meta$2e$glob__$2e2f$lazy$2f2a2e$js$2c$__ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js.import-meta-glob.mjs [test] (import.meta.glob ./lazy/*.js, ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$meta$2d$glob$2f$input$2f$index$2e$js$2e$import$2d$meta$2d$glob$2e$mjs__$5b$test$5d$__$28$import$2e$meta$2e$glob__$2e2f$eager$2f2a2e$js__eager$2c$__ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-meta-glob/input/index.js.import-meta-glob.mjs [test] (import.meta.glob ./eager/*.js eager, ecmascript)");
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
const lazy = __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$meta$2d$glob$2f$input$2f$index$2e$js$2e$import$2d$meta$2d$glob$2e$mjs__$5b$test$5d$__$28$import$2e$meta$2e$glob__$2e2f$lazy$2f2a2e$js$2c$__ecmascript$29$__["default"];
// Eager matches are evaluated synchronously, so they stay in the entry chunk.
const eager = __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$meta$2d$glob$2f$input$2f$index$2e$js$2e$import$2d$meta$2d$glob$2e$mjs__$5b$test$5d$__$28$import$2e$meta$2e$glob__$2e2f$eager$2f2a2e$js__eager$2c$__ecmascript$29$__["default"];
console.log(eager);
lazy['./lazy/a.js']().then(console.log);
}),
]);

//# sourceMappingURL=0_9x_turbopack-tests_tests_snapshot_imports_import-meta-glob_input_15ktvkpdyzw0c._.js.map