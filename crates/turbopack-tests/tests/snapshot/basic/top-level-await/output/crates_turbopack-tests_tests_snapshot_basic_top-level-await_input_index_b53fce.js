(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/crates_turbopack-tests_tests_snapshot_basic_top-level-await_input_index_b53fce.js", {

"[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js (ecmascript, manifest chunk, loader)": (({ r: __turbopack_require__, f: __turbopack_require_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, l: __turbopack_load__, j: __turbopack_dynamic__, g: global, __dirname }) => (() => {

__turbopack_export_value__((__turbopack_import__) => {
    return Promise.all([{"path":"output/crates_turbopack-tests_tests_snapshot_basic_top-level-await_input_UserAPI_d6e51f.js","included":["[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js (ecmascript, manifest chunk)"]},"output/crates_turbopack-tests_tests_snapshot_basic_top-level-await_input_UserAPI_6657ac.js"].map((chunk) => __turbopack_load__(chunk))).then(() => {
        return __turbopack_require__("[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js (ecmascript, manifest chunk)");
    }).then((chunks) => {
        return Promise.all(chunks.map((chunk) => __turbopack_load__(chunk)));
    }).then(() => {
        return __turbopack_import__("[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js (ecmascript)");
    });
});

})()),
"[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/Actions.js (ecmascript)": (({ r: __turbopack_require__, f: __turbopack_require_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, l: __turbopack_load__, j: __turbopack_dynamic__, g: global, __dirname, k: __turbopack_refresh__ }) => (() => {

__turbopack_esm__({
    "AlternativeCreateUserAction": ()=>AlternativeCreateUserAction,
    "CreateUserAction": ()=>CreateUserAction
});
const UserApi = __turbopack_require__("[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js (ecmascript, manifest chunk, loader)")(__turbopack_import__);
const CreateUserAction = async (name)=>{
    console.log("Creating user", name);
    const { createUser } = await UserApi;
    await createUser(name);
};
const AlternativeCreateUserAction = async (name)=>{
    const { createUser } = await __turbopack_require__("[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js (ecmascript, manifest chunk, loader)")(__turbopack_import__);
    await createUser(name);
};

})()),
"[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/index.js (ecmascript)": (({ r: __turbopack_require__, f: __turbopack_require_context__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, n: __turbopack_export_namespace__, c: __turbopack_cache__, l: __turbopack_load__, j: __turbopack_dynamic__, g: global, __dirname, k: __turbopack_refresh__ }) => (() => {

var __TURBOPACK__imported__module__$5b$project$5d2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$top$2d$level$2d$await$2f$input$2f$Actions$2e$js__$28$ecmascript$29$__ = __turbopack_import__("[project]/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/Actions.js (ecmascript)");
"__TURBOPACK__ecmascript__hoisting__location__";
;
(async ()=>{
    await __TURBOPACK__imported__module__$5b$project$5d2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$top$2d$level$2d$await$2f$input$2f$Actions$2e$js__$28$ecmascript$29$__["CreateUserAction"]("John");
    console.log("created user John");
})();

})()),
}]);

//# sourceMappingURL=crates_turbopack-tests_tests_snapshot_basic_top-level-await_input_index_b53fce.js.map