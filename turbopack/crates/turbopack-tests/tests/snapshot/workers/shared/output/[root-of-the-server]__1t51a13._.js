(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/[root-of-the-server]__1t51a13._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/index.js [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

var __TURBOPACK__import$2e$meta__ = {
    get url () {
        return __turbopack_context__.F("turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/index.js");
    },
    env: {
        DEV: true,
        PROD: false,
        MODE: "development",
        BASE_URL: "/",
        SSR: false
    }
};
const url = new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/worker.js (static in ecmascript)"));
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/worker.js [test] (ecmascript, worker loader)")(SharedWorker);
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/workers/shared/input/worker.js (static in ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.q("/static/worker.1n36e5vaxakik.js");}),
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
 * `[TURBOPACK_NEXT_CHUNK_URLS, ASSET_SUFFIX, WORKER_CHUNK_BASE_PATH, PRELOAD_CHUNK_URLS, ...workerForwardedGlobals values]`
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
    // The worker's own chunks. Kept in their original order (and reversed the
    // same way as before) so the shared runtime chunk — emitted last by
    // `evaluated_chunk_group` — ends up first and the bootstrap can `shift()` it
    // off to load it after everything else.
    const workerChunkPaths = moduleChunks.map((chunk)=>typeof chunk === 'string' ? chunk : chunk.path);
    const workerChunkSet = new Set(workerChunkPaths);
    // Chunks already loaded in the runtime creating this worker. Worker chunk
    // groups use normal (nested) availability info, so modules the creating
    // runtime already has are *not* in `moduleChunks`. The worker realm needs its
    // own copies of those factories (functions can't be structured-cloned), so we
    // hand over the chunk paths and let the worker re-import them — cheap, since
    // the browser has them cached.
    //
    // These must be registered *before* the worker's own chunks, for two reasons:
    //  1. The worker's evaluate chunk instantiates the entry module, whose
    //     factory may live in one of these chunks.
    //  2. A worker loader has the same module id in every chunk group (its ident
    //     deliberately excludes availability info), but carries a different chunk
    //     list per group. Loading the worker's own chunks last means its version
    //     wins, so a nested worker gets the correctly-pruned chunk list.
    // They travel in their own params slot so the bootstrap can order them.
    const preloadChunkPaths = (typeof /*TURBOPACK member replacement*/ __turbopack_context__.G === 'function' ? /*TURBOPACK member replacement*/ __turbopack_context__.G() : []).filter((chunkPath)=>!workerChunkSet.has(chunkPath));
    const chunkUrls = workerChunkPaths.map((chunkPath)=>/*TURBOPACK member replacement*/ __turbopack_context__.h(chunkPath, workerBasePath)).reverse();
    const preloadUrls = preloadChunkPaths.map((chunkPath)=>/*TURBOPACK member replacement*/ __turbopack_context__.h(chunkPath, workerBasePath));
    const params = [
        chunkUrls,
        /*TURBOPACK member replacement*/ __turbopack_context__.X,
        workerBasePath,
        preloadUrls
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
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__1t51a13._.js.map