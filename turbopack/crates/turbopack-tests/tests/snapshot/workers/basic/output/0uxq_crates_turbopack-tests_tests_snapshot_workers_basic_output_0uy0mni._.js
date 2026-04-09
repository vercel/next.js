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

Object.assign(self, {
    TURBOPACK_NEXT_CHUNK_URLS: chunkUrls,
    TURBOPACK_ASSET_SUFFIX: param(1)
});

if (chunkUrls.length > 0) {
    var scriptsToLoad = [];
    for (var i = 0; i < chunkUrls.length; i++) {
        var chunk = chunkUrls[i];
        // Chunks are relative to the origin.
        var chunkUrl = new URL(chunk, location.origin);
        if (chunkUrl.origin !== location.origin) {
            abort("Refusing to load script from foreign origin: " + chunkUrl.origin);
        }
        scriptsToLoad.push(chunkUrl.toString());
    }

    // As scripts are loaded, allow them to pop from the array
    chunkUrls.reverse();
    importScripts.apply(self, scriptsToLoad);
}
})();