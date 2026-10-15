import { test } from 'vitest'
test('context-local assertion state', ({ expect: localExpect }) => {
  localExpect.assertions(1)
  localExpect(42).toBe(42)
})
