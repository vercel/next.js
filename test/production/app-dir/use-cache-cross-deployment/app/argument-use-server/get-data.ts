globalThis.noop = () => {}

export async function getData(action) {
  'use cache: remote'

  // Pretend to use it
  globalThis.noop(action)

  return Math.random()
}
