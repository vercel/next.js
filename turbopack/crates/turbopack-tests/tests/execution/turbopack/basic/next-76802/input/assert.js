// app/assert.js
export function assert(a, b) {
  if (a !== b) {
    throw new Error(`Assertion failed: ${a} !== ${b}`)
  }
}
