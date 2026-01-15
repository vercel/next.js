const url = new URL('./worker.js', import.meta.url)
new Worker(url)
