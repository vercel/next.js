// Imported in the same order as shared.js from both chunks, so both modules can share a factory.
export const someLongExportName = 'second-1'
export const a = 'second-short'
export let liveValue = 0
export function increment() {
  liveValue++
}

// A user binding with the internal marker's spelling must not be consumed as generated code.
function __turbopack_flat_esm__(value) {
  if (value !== 'user code') throw new Error('user call changed')
}
__turbopack_flat_esm__('user code')
