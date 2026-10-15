import { test, expect } from 'vitest'
test('Edge realm APIs have their own identity', () => {
  expect(globalThis.EdgeRuntime).toBe('edge-runtime')
  expect(new Response('edge').status).toBe(200)
})
