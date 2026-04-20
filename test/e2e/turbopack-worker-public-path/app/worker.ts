// Post back the worker's own entrypoint URL so the main thread can inspect it.
// A same-origin Worker will report an href under the page's origin; a
// cross-origin Worker would have failed to construct.
self.postMessage(self.location.href)
