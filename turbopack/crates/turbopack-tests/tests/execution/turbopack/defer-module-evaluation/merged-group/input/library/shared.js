globalThis.deferEvents.push('shared')

export const value = 'shared'

export let count = 0

export function increment() {
  count++
}
