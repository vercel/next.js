(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/1jsg_tests_snapshot_imports_external_unsupported_patterns_input_index_1j1qa8awmxd4c.js","[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/external_unsupported_patterns/input/index.js [test] (ecmascript)",((__turbopack_context__, module, exports) => {

globalThis.requireExternal = ()=>(()=>{
        const e = new Error("Cannot find module 'node:async_hooks': external modules are not supported in the browser environment");
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    })();
globalThis.importExternal = ()=>Promise.resolve().then(()=>(()=>{
            const e = new Error("Cannot find module 'node:async_hooks': external modules are not supported in the browser environment");
            e.code = 'MODULE_NOT_FOUND';
            throw e;
        })());
globalThis.resolveExternal = ()=>"node:async_hooks";
let request;
if (Math.random() > 0.5) {
    request = 'node:async_hooks';
} else {
    request = 'node:fs';
}
globalThis.requireExternalPattern = ()=>__turbopack_context__.f([
        "node:async_hooks",
        ()=>(()=>{
                const e = new Error("Cannot find module 'node:async_hooks': external modules are not supported in the browser environment");
                e.code = 'MODULE_NOT_FOUND';
                throw e;
            })(),
        "node:fs",
        ()=>(()=>{
                const e = new Error("Cannot find module 'node:fs': external modules are not supported in the browser environment");
                e.code = 'MODULE_NOT_FOUND';
                throw e;
            })()
    ])(request);
globalThis.importExternalPattern = ()=>__turbopack_context__.f([
        "node:async_hooks",
        ()=>Promise.resolve().then(()=>(()=>{
                    const e = new Error("Cannot find module 'node:async_hooks': external modules are not supported in the browser environment");
                    e.code = 'MODULE_NOT_FOUND';
                    throw e;
                })()),
        "node:fs",
        ()=>Promise.resolve().then(()=>(()=>{
                    const e = new Error("Cannot find module 'node:fs': external modules are not supported in the browser environment");
                    e.code = 'MODULE_NOT_FOUND';
                    throw e;
                })())
    ], 1).import(request);
globalThis.resolveExternalPattern = ()=>__turbopack_context__.f([
        "node:async_hooks",
        ()=>"node:async_hooks",
        "node:fs",
        ()=>"node:fs"
    ]).resolve(request);
})]);

//# sourceMappingURL=1jsg_tests_snapshot_imports_external_unsupported_patterns_input_index_1j1qa8awmxd4c.js.map