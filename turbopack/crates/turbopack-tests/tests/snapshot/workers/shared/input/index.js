const url = new URL('./worker.js', import.meta.url)
new SharedWorker(url)

// The same through the global object
new globalThis.SharedWorker(
  new globalThis.URL('./global-this-worker.js', import.meta.url)
)
