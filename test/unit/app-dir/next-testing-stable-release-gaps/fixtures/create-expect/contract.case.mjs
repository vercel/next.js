import { test, expect, createExpect } from 'vitest'
test('independent assertion instances', () => {
  const local = createExpect()
  local.assertions(1)
  local(42).toBe(42)
  expect(local.getState().assertionCalls).toBe(1)
})
