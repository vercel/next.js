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

// The Turbopack runtime is the last asset emitted by (see
// `BrowserChunkingContext::evaluated_chunk_group`). `createWorker`
// reverses the chunk list, so it is the first item in `chunkUrls`.
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