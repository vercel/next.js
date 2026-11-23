console.log('index.js')
const url = new globalThis.URL('./worker.js', import.meta.url)
new globalThis.Worker(url)
