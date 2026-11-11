import { test, expect, vi } from 'vitest'
test('runtime registration then unregistration', async () => {
  vi.doMock('./subject.mjs', () => ({ value: 42 }))
  expect((await import('./subject.mjs')).value).toBe(42)
  vi.doUnmock('./subject.mjs')
  vi.resetModules()
  expect((await import('./subject.mjs')).value).toBe(1)
})
