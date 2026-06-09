(function() {
function abort(message) {
    console.error(message);
    throw new Error(message);
}
if (
    typeof self["WorkerGlobalScope"] === "undefined" ||
    !(self instanceof self["WorkerGlobalScope"])
) {
    abort("Worker entrypoint must be loaded in a worker context");
}

// Try querystring first (SharedWorker), then hash (regular Worker)
var url = new URL(location.href);
var paramsString = url.searchParams.get("params");
if (!paramsString && url.hash.startsWith("#params=")) {
    paramsString = decodeURIComponent(url.hash.slice("#params=".length));
}

if (!paramsString) abort("Missing worker bootstrap config");

var params = JSON.parse(paramsString);
var param = (n) => typeof params[n] === 'string' ? params[n] : '';
var chunkUrls = Array.isArray(params[0]) ? params[0] : [];

// Chunks are relative to the origin; only allow loading same-origin scripts.
function sameOriginUrl(chunk) {
    var chunkUrl = new URL(chunk, location.origin);
    if (chunkUrl.origin !== location.origin) {
        abort("Refusing to load script from foreign origin: " + chunkUrl.origin);
    }
    return chunkUrl.toString();
}

// The Turbopack runtime is shared across entrypoints and emitted as the last
// asset of the evaluated chunk group (see
// `BrowserChunkingContext::evaluated_chunk_group`), so after `createWorker`
// reverses the chunk list it is the FIRST entry here. It bootstraps the module
// system by draining the registration queue, so it must be loaded AFTER the
// module chunks have enqueued their registrations. It must also stay out of
// `TURBOPACK_NEXT_CHUNK_URLS`: it never registers itself, so leaving it in the
// list would desync the pop-based chunk-path identification used in workers
// (see `getChunkFromRegistration`).
var runtimeUrl = chunkUrls.length > 0 ? chunkUrls.shift() : undefined;

Object.assign(self, {
    TURBOPACK_NEXT_CHUNK_URLS: chunkUrls,
    TURBOPACK_ASSET_SUFFIX: param(1)
});

if (chunkUrls.length > 0 || runtimeUrl) {
    var scriptsToLoad = [];
    for (var i = 0; i < chunkUrls.length; i++) {
        scriptsToLoad.push(sameOriginUrl(chunkUrls[i]));
    }

    // As scripts are loaded, allow them to pop from the array
    chunkUrls.reverse();

    // Load the runtime last so it drains the registrations enqueued above.
    if (runtimeUrl) {
        scriptsToLoad.push(sameOriginUrl(runtimeUrl));
    }

    importScripts.apply(self, scriptsToLoad);
}
})();