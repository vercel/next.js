(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/1jsg_tests_snapshot_imports_import-defer-single-chunk_input_1q_y08o-scmf_._.js",(()=>{"use strict";return["[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/index.js [test] (ecmascript)",((__turbopack_context__) => {


return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {
__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/log.js [test] (ecmascript)");
;
// Without async chunk loading, `import.defer()` uses an async module flag module to evaluate async
// modules eagerly.
const lazy = await Promise.resolve().then(()=>__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/lazy.js [test] (ecmascript, async module flag)") ? Promise.resolve(__turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/lazy.js [test] (ecmascript)")).then((ns)=>__turbopack_context__.N(()=>ns, [
            "value"
        ], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/lazy.js [test] (ecmascript)")) : __turbopack_context__.N(__turbopack_context__.D("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/lazy.js [test] (ecmascript)"), [
        "value"
    ], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/lazy.js [test] (ecmascript)"));
const tla = await Promise.resolve().then(()=>__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/tla.js [test] (ecmascript, async module flag)") ? Promise.resolve(__turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/tla.js [test] (ecmascript)")).then((ns)=>__turbopack_context__.N(()=>ns, [
            "value"
        ], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/tla.js [test] (ecmascript)")) : __turbopack_context__.N(__turbopack_context__.D("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/tla.js [test] (ecmascript)"), [
        "value"
    ], "[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/tla.js [test] (ecmascript)"));
__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__["log"].push(`after import.defer: ${__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__["log"].join(',')}`);
__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__["log"].push(`lazy: ${lazy.value}, tla: ${tla.value}`);
console.log(__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__["log"].join('\n'));
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/lazy.js [test] (ecmascript)",((__turbopack_context__) => {


__turbopack_context__.s([
    "value",
    ()=>value
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/log.js [test] (ecmascript)");
;
__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__["log"].push('lazy evaluated');
const value = 'lazy-value';
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/log.js [test] (ecmascript)",((__turbopack_context__) => {


__turbopack_context__.s([
    "log",
    ()=>log
]);
const log = [];
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/tla.js [test] (ecmascript)",((__turbopack_context__) => {


return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {
__turbopack_context__.s([
    "value",
    ()=>value
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/log.js [test] (ecmascript)");
;
await Promise.resolve();
__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$imports$2f$import$2d$defer$2d$single$2d$chunk$2f$input$2f$log$2e$js__$5b$test$5d$__$28$ecmascript$29$__["log"].push('tla evaluated');
const value = 'tla-value';
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);})]})(),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/lazy.js [test] (ecmascript, async module flag)",(function(__turbopack_context__){

__turbopack_context__.v(false);
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/tla.js [test] (ecmascript, async module flag)",(function(__turbopack_context__){

__turbopack_context__.v(true);
})]);(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([
    "output/1ece_tests_snapshot_imports_import-defer-single-chunk_input_176_zr2ev8d44._.js",
    {"otherChunks":[],"runtimeModuleIds":["[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/import-defer-single-chunk/input/index.js [test] (ecmascript)"]}
]);
// Dummy runtime


//# sourceMappingURL=index.entry.js.map