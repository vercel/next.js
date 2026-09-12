globalThis.createWorker = ({ classWorkerURL, ...options } = {}) => {
  if (classWorkerURL) {
    return new Worker(new URL(classWorkerURL, import.meta.url), options)
  }
}

globalThis.fallbackURL = (override) =>
  override != null
    ? new URL(override, import.meta.url)
    : new URL('./fallback.txt', import.meta.url)
