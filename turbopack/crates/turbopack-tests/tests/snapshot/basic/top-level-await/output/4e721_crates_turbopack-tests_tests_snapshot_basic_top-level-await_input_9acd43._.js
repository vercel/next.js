(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/4e721_crates_turbopack-tests_tests_snapshot_basic_top-level-await_input_9acd43._.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/Actions.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
// import() doesn't care about whether a module is an async module or not
__turbopack_esm__({
    "AlternativeCreateUserAction": (()=>AlternativeCreateUserAction),
    "CreateUserAction": (()=>CreateUserAction)
});
const UserApi = __turbopack_require__("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js [test] (ecmascript, async loader)")(__turbopack_import__);
const CreateUserAction = async (name)=>{
    console.log("Creating user", name);
    // These are normal awaits, because they are in an async function
    const { createUser } = await UserApi;
    await createUser(name);
};
const AlternativeCreateUserAction = async (name)=>{
    const { createUser } = await __turbopack_require__("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js [test] (ecmascript, async loader)")(__turbopack_import__);
    await createUser(name);
}; // Note: Using await import() at top-level doesn't make much sense
 //       except in rare cases. It will import modules sequentially.
}}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/index.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { r: __turbopack_require__, f: __turbopack_module_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, M: __turbopack_modules__, l: __turbopack_load__, j: __turbopack_dynamic__, P: __turbopack_resolve_absolute_path__, U: __turbopack_relative_url__, R: __turbopack_resolve_module_id_path__, b: __turbopack_worker_blob_url__, g: global, __dirname, z: __turbopack_require_stub__ } = __turbopack_context__;
{
__turbopack_esm__({});
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$top$2d$level$2d$await$2f$input$2f$Actions$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_import__("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/Actions.js [test] (ecmascript)");
;
(async ()=>{
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$top$2d$level$2d$await$2f$input$2f$Actions$2e$js__$5b$test$5d$__$28$ecmascript$29$__["CreateUserAction"])("John");
    console.log("created user John");
})();
}}),
}]);

//# sourceMappingURL=4e721_crates_turbopack-tests_tests_snapshot_basic_top-level-await_input_9acd43._.js.map