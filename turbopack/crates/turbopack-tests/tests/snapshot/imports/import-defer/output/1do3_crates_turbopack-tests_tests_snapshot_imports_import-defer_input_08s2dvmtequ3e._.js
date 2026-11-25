(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/1do3_crates_turbopack-tests_tests_snapshot_imports_import-defer_input_08s2dvmtequ3e._.js","[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer/input/index.js [test] (ecmascript)",((__turbopack_context__) => {
"use strict";

// prettier-ignore
var __TURBOPACK__deferred__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.D("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer/input/lib.js [test] (ecmascript)");
;
function useLib() {
    return __TURBOPACK__deferred__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2f$input$2f$lib$2e$js__$5b$test$5d$__$28$ecmascript$29$__()["used"];
}
async function dynamicLib() {
    // prettier-ignore
    const ns = await __turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer/input/dynamic.js [test] (ecmascript, async loader)", [
        "value"
    ]);
    return ns.value;
}
useLib();
dynamicLib();
__turbopack_context__.s([
    "dynamicLib",
    0,
    dynamicLib,
    "useLib",
    0,
    useLib
]);
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer/input/lib.js [test] (ecmascript)",((__turbopack_context__) => {
"use strict";

const used = 'used-export';
const unused = 'UNUSED_EXPORT_SHOULD_BE_TREE_SHAKEN';
__turbopack_context__.s([
    "used",
    0,
    used
]);
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer/input/dynamic.js [test] (ecmascript, async module flag)",(function(__turbopack_context__){

__turbopack_context__.v(false);
})]);

//# sourceMappingURL=1do3_crates_turbopack-tests_tests_snapshot_imports_import-defer_input_08s2dvmtequ3e._.js.map