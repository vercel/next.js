console.log('index.js')
const url = new URL('./worker.js', import.meta.url)
new Worker(url)

// The same through the global object
new globalThis.Worker(new URL('./global-this-worker.js', import.meta.url))
