(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/[root-of-the-server]__09q-mwc._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/worker.js (static in ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.q("/static/worker.1n36e5vaxakik.js");}),
"[turbopack]/shared/worker-browser.ts [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createWorker",
    ()=>createWorker
]);
/**
 * Browser worker creation module.
 * Only included when a Web Worker or SharedWorker is actually used.
 */ 'use turbopack no side effects';
function createWorker(WorkerConstructor, entrypoint, moduleChunks, workerOptions) {
    const isSharedWorker = WorkerConstructor.name === 'SharedWorker';
    const chunkUrls = moduleChunks.map((chunk)=>/*TURBOPACK member replacement*/ __turbopack_context__.w(chunk)).reverse();
    const params = [
        chunkUrls,
        /*TURBOPACK member replacement*/ __turbopack_context__.X()
    ];
    for (const globalName of /*TURBOPACK member replacement*/ __turbopack_context__.b()){
        params.push(globalThis[globalName]);
    }
    const url = new URL(/*TURBOPACK member replacement*/ __turbopack_context__.w(entrypoint), location.origin);
    const paramsJson = JSON.stringify(params);
    if (isSharedWorker) {
        url.searchParams.set('params', paramsJson);
    } else {
        url.hash = '#params=' + encodeURIComponent(paramsJson);
    }
    // Remove type: "module" from options since our worker entrypoint is not a module
    const options = workerOptions ? {
        ...workerOptions,
        type: undefined
    } : undefined;
    return new WorkerConstructor(url, options);
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/worker.js [test] (ecmascript, worker loader)", ((__turbopack_context__) => {

var createWorker = __turbopack_context__.r("[turbopack]/shared/worker-browser.ts [test] (ecmascript)").createWorker;
__turbopack_context__.v(function(Ctor, opts) {
    return createWorker(Ctor, "output/0uxq_crates_turbopack-tests_tests_snapshot_workers_shared_output_0uy0mni._.js", ["output/1do3_crates_turbopack-tests_tests_snapshot_workers_shared_input_worker_1u1i0a1.js","output/1i9t_crates_turbopack-tests_tests_snapshot_workers_shared_input_worker_1xw116u.js"], opts);
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

var __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/index.js")}`;
    }
};
const url = new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/worker.js (static in ecmascript)"));
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/worker.js [test] (ecmascript, worker loader)")(SharedWorker);
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__09q-mwc._.js.map