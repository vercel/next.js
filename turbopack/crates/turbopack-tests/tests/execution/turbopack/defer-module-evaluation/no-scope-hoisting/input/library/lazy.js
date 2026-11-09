// The package declares this module side effect free. The push only makes the evaluation visible
// to the test.
globalThis.deferEvents.push('lazy')

export const value = 'lazy'

export let count = 0

export function increment() {
  count++
}
