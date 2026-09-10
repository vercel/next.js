globalThis.createWorker = ({ classWorkerURL, ...options } = {}) => {
  if (classWorkerURL) {
    return new Worker(new URL(classWorkerURL, import.meta.url), options)
  }
}

globalThis.fallbackURL = (override) =>
  new URL(override ?? './fallback.txt', import.meta.url)
