export function spawn() {
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
}

export function answer() {
  return 42
}
