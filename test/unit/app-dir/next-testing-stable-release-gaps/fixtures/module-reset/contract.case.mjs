import { test, expect, vi } from 'vitest'
test('resetModules creates a fresh module state', async () => {
  const first = await import('./subject.mjs')
  expect(first.next()).toBe(1)
  vi.resetModules()
  const second = await import('./subject.mjs')
  expect(second.next()).toBe(1)
  expect(first).not.toBe(second)
})
