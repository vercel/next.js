import { test, expect } from 'vitest'
test('passing async assertion is observed', () => {
  expect(Promise.resolve(42)).resolves.toBe(42)
})
