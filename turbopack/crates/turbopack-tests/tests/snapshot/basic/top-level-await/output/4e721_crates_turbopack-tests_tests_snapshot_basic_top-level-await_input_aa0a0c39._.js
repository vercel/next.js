(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push(["output/4e721_crates_turbopack-tests_tests_snapshot_basic_top-level-await_input_aa0a0c39._.js", {

"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/db-connection.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { a: __turbopack_async_module__ } = __turbopack_context__;
__turbopack_async_module__(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {
__turbopack_context__.s({
    "close": ()=>close2,
    "dbCall": ()=>dbCall1
});
const connectToDB = async (url)=>{
    console.log('connecting to db', url);
    await new Promise((r)=>setTimeout(r, 1000));
};
// This is a top-level-await
await connectToDB('my-sql://example.com');
const dbCall1 = async (data)=>{
    console.log('dbCall', data);
    // This is a normal await, because it's in an async function
    await new Promise((r)=>setTimeout(r, 100));
    return 'fake data';
};
const close2 = ()=>{
    console.log('closes the DB connection');
};
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/UserAPI.js [test] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { a: __turbopack_async_module__ } = __turbopack_context__;
__turbopack_async_module__(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {
__turbopack_context__.s({
    "createUser": ()=>createUser2
});
var __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$top$2d$level$2d$await$2f$input$2f$db$2d$connection$2e$js__$5b$test$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/turbopack/crates/turbopack-tests/tests/snapshot/basic/top-level-await/input/db-connection.js [test] (ecmascript)");
var __turbopack_async_dependencies__1 = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$top$2d$level$2d$await$2f$input$2f$db$2d$connection$2e$js__$5b$test$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$top$2d$level$2d$await$2f$input$2f$db$2d$connection$2e$js__$5b$test$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__1.then ? (await __turbopack_async_dependencies__1)() : __turbopack_async_dependencies__1;
;
const createUser2 = async (name)=>{
    const command1 = `CREATE USER ${name}`;
    // This is a normal await, because it's in an async function
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$turbopack$2d$tests$2f$tests$2f$snapshot$2f$basic$2f$top$2d$level$2d$await$2f$input$2f$db$2d$connection$2e$js__$5b$test$5d$__$28$ecmascript$29$__["dbCall"])({
        command: command1
    });
};
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
}]);

//# sourceMappingURL=4e721_crates_turbopack-tests_tests_snapshot_basic_top-level-await_input_aa0a0c39._.js.map