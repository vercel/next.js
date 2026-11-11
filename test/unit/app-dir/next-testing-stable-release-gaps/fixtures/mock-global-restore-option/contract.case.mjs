import { test, expect, vi } from 'vitest'
test('first stub', () => {
  vi.stubGlobal('releaseGlobal', 42)
  expect(globalThis.releaseGlobal).toBe(42)
})
test('next case sees unstubbed global', () =>
  expect(globalThis.releaseGlobal).toBeUndefined())
