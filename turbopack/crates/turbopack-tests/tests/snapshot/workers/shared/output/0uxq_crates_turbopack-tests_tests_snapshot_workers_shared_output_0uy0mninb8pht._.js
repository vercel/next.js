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
// Chunks already loaded in the runtime that created this worker. They
// carry module factories this worker's own chunk group omitted (because
// the creating runtime already had them), so they must be registered
// before the worker's evaluate chunk instantiates the entry module.
var preloadUrls = Array.isArray(params[3]) ? params[3] : [];

// Chunks are relative to the origin; only allow loading same-origin scripts.
function sameOriginUrl(chunk) {
    var chunkUrl = new URL(chunk, location.origin);
    if (chunkUrl.origin !== location.origin) {
        abort("Refusing to load script from foreign origin: " + chunkUrl.origin);
    }
    return chunkUrl.toString();
}

var loadOrder = preloadUrls.concat(chunkUrls.slice().reverse());
var nextChunkUrls = loadOrder.slice().reverse();

Object.assign(self, {
    TURBOPACK_NEXT_CHUNK_URLS: nextChunkUrls,
    TURBOPACK_ASSET_SUFFIX: param(1),
    TURBOPACK_CHUNK_BASE_PATH: param(2)
});

if (loadOrder.length > 0) {
    var scriptsToLoad = [];
    for (var i = 0; i < loadOrder.length; i++) {
        scriptsToLoad.push(sameOriginUrl(loadOrder[i]));
    }
    importScripts.apply(self, scriptsToLoad);
}
})();