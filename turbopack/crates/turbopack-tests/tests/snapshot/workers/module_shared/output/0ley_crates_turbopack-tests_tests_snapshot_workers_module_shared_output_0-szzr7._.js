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

// Buffer connect events for SharedWorkers: the async await below creates a suspension
// point where the browser can dispatch connect before the user module has registered
// its addEventListener('connect', ...) handler.
var _connectBuffer_ = null;
var _connectListener_ = null;
if (typeof self['SharedWorkerGlobalScope'] !== 'undefined' && self instanceof self['SharedWorkerGlobalScope']) {
    _connectBuffer_ = [];
    _connectListener_ = function(e) { _connectBuffer_.push(e.ports[0]); };
    self.addEventListener('connect', _connectListener_);
}

await Promise.all(chunkUrls.map(function(chunk) {
    return import(chunk);
}));

// Replay connect events that arrived during async initialization
if (_connectBuffer_ !== null) {
    self.removeEventListener('connect', _connectListener_);
    for (var _i_ = 0; _i_ < _connectBuffer_.length; _i_++) {
        self.dispatchEvent(new MessageEvent('connect', { ports: [_connectBuffer_[_i_]] }));
    }
}