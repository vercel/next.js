/**
 * Worker entrypoint bootstrap.
 */ ;
(()=>{
    function abort(message) {
        console.error(message);
        throw new Error(message);
    }
    // Security: Ensure this code is running in a worker environment to prevent
    // the worker entrypoint being used as an XSS gadget. If this is a worker, we
    // know that the origin of the caller is the same as our origin.
    if (typeof self['WorkerGlobalScope'] === 'undefined' || !(self instanceof self['WorkerGlobalScope'])) {
        abort('Worker entrypoint must be loaded in a worker context');
    }
    const url = new URL(location.href);
    // Try querystring first (SharedWorker), then hash (regular Worker)
    let paramsString = url.searchParams.get('params');
    if (!paramsString && url.hash.startsWith('#params=')) {
        paramsString = decodeURIComponent(url.hash.slice('#params='.length));
    }
    if (!paramsString) abort('Missing worker bootstrap config');
    // Safety: this string requires that a script on the same origin has loaded
    // this code as a module. We still don't fully trust it, so we'll validate the
    // types and ensure that the next chunk URLs are same-origin.
    const config = JSON.parse(paramsString);
    const TURBOPACK_CHUNK_SUFFIX = typeof config.S === 'string' ? config.S : '';
    const NEXT_DEPLOYMENT_ID = typeof config.N === 'string' ? config.N : '';
    // In a normal browser context, the runtime can figure out which chunk is
    // currently executing via `document.currentScript`. Workers don't have that
    // luxury, so we use `TURBOPACK_NEXT_CHUNK_URLS` as a stack instead
    // (`reverse()`d below).
    //
    // Each chunk pops its URL off the front of the array when it runs, so we need
    // to store them in reverse order to make sure the first chunk to execute sees
    // its own URL at the front.
    const TURBOPACK_NEXT_CHUNK_URLS = Array.isArray(config.NC) ? config.NC : [];
    Object.assign(self, {
        TURBOPACK_CHUNK_SUFFIX,
        TURBOPACK_NEXT_CHUNK_URLS,
        NEXT_DEPLOYMENT_ID
    });
    if (TURBOPACK_NEXT_CHUNK_URLS.length > 0) {
        const scriptsToLoad = [];
        for (const chunk of TURBOPACK_NEXT_CHUNK_URLS){
            // Chunks are relative to the origin.
            const chunkUrl = new URL(chunk, location.origin);
            // Security: Only load scripts from the same origin. This prevents this
            // worker entrypoint from being used as a gadget to load scripts from
            // foreign origins if someone happens to find a separate XSS vector
            // elsewhere on this origin.
            if (chunkUrl.origin !== location.origin) {
                abort(`Refusing to load script from foreign origin: ${chunkUrl.origin}`);
            }
            scriptsToLoad.push(chunkUrl.toString());
        }
        TURBOPACK_NEXT_CHUNK_URLS.reverse();
        importScripts(...scriptsToLoad);
    }
})();


//# sourceMappingURL=turbopack_crates_turbopack-tests_tests_snapshot_workers_basic_output_2867ca5f._.js.map