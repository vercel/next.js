// A worker that spawns another instance of itself.
new Worker(new URL('./worker.js', import.meta.url))
