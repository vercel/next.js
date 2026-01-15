/**
 * Worker entrypoint bootstrap.
 */ ;
(()=>{
    const url = new URL(location.href);
    // Try querystring first (SharedWorker), then hash (regular Worker)
    let paramsString = url.searchParams.get('params');
    if (!paramsString && url.hash.startsWith('#params=')) {
        paramsString = decodeURIComponent(url.hash.slice('#params='.length));
    }
    if (!paramsString) return;
    const config = JSON.parse(paramsString);
    const TURBOPACK_CHUNK_SUFFIX = config.globals.S ?? '';
    const TURBOPACK_NEXT_CHUNK_URLS = config.globals.NC ?? [];
    Object.assign(self, {
        TURBOPACK_CHUNK_SUFFIX,
        TURBOPACK_NEXT_CHUNK_URLS
    });
    if (TURBOPACK_NEXT_CHUNK_URLS.length > 0) {
        importScripts(...TURBOPACK_NEXT_CHUNK_URLS.map((chunk)=>new URL(chunk, location.origin).toString()).reverse());
    }
})();


//# sourceMappingURL=turbopack_crates_turbopack-tests_tests_snapshot_workers_shared_output_2867ca5f._.js.map