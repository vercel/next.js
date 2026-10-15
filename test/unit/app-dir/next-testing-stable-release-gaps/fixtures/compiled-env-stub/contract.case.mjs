import { test, expect, vi } from 'vitest'
test('environment stubs affect uninlined application import or explain the boundary', async () => {
  vi.stubEnv('NEXT_PUBLIC_RELEASE_STUB', 'changed')
  const { read } = await import('./environment.mjs')
  expect(read()).toBe('changed')
})
