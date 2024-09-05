let workerUrl = new URL('./worker.ts', import.meta.url);
new Worker(workerUrl)
