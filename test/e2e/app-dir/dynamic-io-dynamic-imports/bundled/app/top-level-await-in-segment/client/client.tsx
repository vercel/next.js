'use client'

console.log('[page - /top-level-await-in-segment] sleeping...')
await new Promise((resolve) => setTimeout(resolve, 500))
console.log('[page - /top-level-await-in-segment] done sleeping')

export function Client() {
  return 'hello'
}
