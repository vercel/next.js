import { test, expect, vi } from 'vitest'
vi.mock('./subject.mjs', () => ({ value: 42 }))
test('actual module bypasses mock', async () => {
  const actual = await vi.importActual('./subject.mjs')
  expect(actual.value).toBe(1)
  expect((await import('./subject.mjs')).value).toBe(42)
})
