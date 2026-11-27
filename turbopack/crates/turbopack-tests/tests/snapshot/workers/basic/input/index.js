console.log('index.js')
const url = new URL('./worker.js', import.meta.url)
new Worker(url)

// The same through the global object
new globalThis.Worker(
  new globalThis.URL('./global-this-worker.js', import.meta.url)
)
