(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/[root-of-the-server]__07l1lih._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/basic/input/worker.js (static in ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.q("/static/worker.2-qnq-strt8dn.js");}),
"[turbopack-ecmascript]/worker/browser/createWorker.ts [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Embedded worker-runtime helper. This file is bundled as a regular module and
// `__turbopack_require__`d by the generated web-worker loader code.
//
// The chunk-URL builder, the chunk base path and the asset suffix are read from
// the shared `__turbopack_chunk_relative_url__` / `__turbopack_chunk_base_path__`
// / `__turbopack_chunk_asset_suffix__` runtime primitives. The worker base-path
// override and forwarded-global names are baked into this module at build time by
// `turbopack-ecmascript` replacing the `_TURBOPACK_WORKER_BASE_PATH_` /
// `_TURBOPACK_WORKER_FORWARDED_GLOBALS_` free variables, and the forwarded-global
// values are read from `globalThis`.
__turbopack_context__.s([
    "default",
    ()=>generateCreateWorker
]);
/**
 * Creates a web worker by instantiating the given WorkerConstructor with the
 * appropriate URL and options.
 *
 * The entrypoint is a pre-compiled worker runtime file. The params configure
 * which module chunks to load and which module to run as the entry point.
 *
 * The params are a JSON array of the following structure:
 * `[TURBOPACK_NEXT_CHUNK_URLS, ASSET_SUFFIX, ...workerForwardedGlobals values]`
 *
 * @param WorkerConstructor The Worker or SharedWorker constructor
 * @param entrypoint path to the worker entrypoint chunk
 * @param moduleChunks list of module chunk paths to load
 * @param workerOptions options to pass to the Worker constructor (optional)
 */ function createWorker(WorkerConstructor, entrypoint, moduleChunks, workerOptions) {
    const isSharedWorker = WorkerConstructor.name === 'SharedWorker';
    // `WORKER_BASE_PATH` overrides `CHUNK_BASE_PATH` for the entrypoint and the
    // module chunks loaded inside the worker, keeping them same-origin to each
    // other when `CHUNK_BASE_PATH` (= `assetPrefix`) is a cross-origin CDN.
    // `null` falls back; an empty string is treated as a literal empty prefix.
    const workerBasePath = null ?? /*TURBOPACK member replacement*/ __turbopack_context__.b;
    const chunkUrls = moduleChunks.map((chunk)=>/*TURBOPACK member replacement*/ __turbopack_context__.h(chunk, workerBasePath)).reverse();
    const params = [
        chunkUrls,
        /*TURBOPACK member replacement*/ __turbopack_context__.X
    ];
    const globals = [];
    for(let i = 0; i < globals.length; i++){
        params.push(globalThis[globals[i]]);
    }
    const url = new URL(/*TURBOPACK member replacement*/ __turbopack_context__.h(entrypoint, workerBasePath), location.origin);
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
function generateCreateWorker(entrypoint, moduleChunks) {
    return (WorkerConstructor, workerOptions)=>createWorker(WorkerConstructor, entrypoint, moduleChunks, workerOptions);
}
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/basic/input/worker.js [test] (ecmascript, worker loader)", ((__turbopack_context__) => {

__turbopack_context__.v(__turbopack_context__.r("[turbopack-ecmascript]/worker/browser/createWorker.ts [test] (ecmascript)")["default"]("output/0uxq_crates_turbopack-tests_tests_snapshot_workers_basic_output_0uy0mni._.js", ["output/1do3_crates_turbopack-tests_tests_snapshot_workers_basic_input_worker_11ygioo.js","output/1i9t_crates_turbopack-tests_tests_snapshot_workers_basic_input_worker_0yr5fg0.js"]));
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/basic/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

var __TURBOPACK__import$2e$meta__ = {
    get url () {
        return __turbopack_context__.F("turbopack/crates/turbopack-tests/tests/snapshot/workers/basic/input/index.js");
    }
};
console.log('index.js');
const url = new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/basic/input/worker.js (static in ecmascript)"));
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/basic/input/worker.js [test] (ecmascript, worker loader)")(Worker);
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__07l1lih._.js.map