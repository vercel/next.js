(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["output/[root-of-the-server]__1gnyf0f._.js",
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = 'turbopack';
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs (static in ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.q("/static/vercel.0kkt412gy5vj6.cjs");}),
"[turbopack]/shared/worker-browser.ts [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createWorker",
    ()=>createWorker
]);
/**
 * Browser worker creation module.
 * Only included when a Web Worker or SharedWorker is actually used.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ 'use turbopack no side effects';
function createWorker(WorkerConstructor, entrypoint, moduleChunks, workerOptions) {
    const isSharedWorker = WorkerConstructor.name === 'SharedWorker';
    const chunkUrls = moduleChunks.map((chunk)=>__turbopack_chunk_url__(chunk)).reverse();
    const params = [
        chunkUrls,
        __turbopack_asset_suffix__()
    ];
    for (const globalName of __turbopack_forwarded_globals__()){
        params.push(globalThis[globalName]);
    }
    const url = new URL(__turbopack_chunk_url__(entrypoint), location.origin);
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
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript, worker loader)", ((__turbopack_context__) => {

var createWorker = __turbopack_context__.r("[turbopack]/shared/worker-browser.ts [test] (ecmascript)").createWorker;
__turbopack_context__.v(function(Ctor, opts) {
    return createWorker(Ctor, "output/0uxq_crates_turbopack-tests_tests_snapshot_imports_ignore-comments_output_0uy0mni._.js", ["output/0_9x_turbopack-tests_tests_snapshot_imports_ignore-comments_input_vercel_cjs_0j-fab5._.js","output/0rv8_turbopack-tests_tests_snapshot_imports_ignore-comments_input_vercel_cjs_02p77ng._.js"], opts);
});
}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)", ((__turbopack_context__) => {

__turbopack_context__.q("/static/ignore-worker.3cqstqcuvhq6o.cjs");}),
"[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/index.js [test] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "foo",
    ()=>foo
]);
var __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/index.js")}`;
    }
};
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.mjs [test] (ecmascript, async loader)").then(console.log);
__turbopack_context__.A("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.mjs [test] (ecmascript, async loader)").then(console.log);
console.log(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript)"));
__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/vercel.cjs [test] (ecmascript, worker loader)")(Worker);
// turbopack shouldn't attempt to bundle these, and they should be preserved in the output
import(/* webpackIgnore: true */ './ignore.mjs');
import(/* turbopackIgnore: true */ './ignore.mjs');
// this should work for cjs requires too
require(/* webpackIgnore: true */ './ignore.cjs');
require(/* turbopackIgnore: true */ './ignore.cjs');
new Worker(new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)")));
new Worker(new __turbopack_context__.U(__turbopack_context__.r("[project]/turbopack/crates/turbopack-tests/tests/snapshot/imports/ignore-comments/input/ignore-worker.cjs (static in ecmascript)")));
function foo(plugin) {
    return require(/* turbopackIgnore: true */ plugin);
}
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__1gnyf0f._.js.map