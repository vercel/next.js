// Post back the worker's own origin so the main thread can verify whether the
// worker entrypoint was loaded same-origin or cross-origin.
self.postMessage(self.location.origin)
