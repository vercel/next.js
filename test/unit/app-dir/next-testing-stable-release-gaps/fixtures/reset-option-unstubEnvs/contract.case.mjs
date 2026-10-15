import { test, expect, vi } from 'vitest'
test('changes environment', () => {
  vi.stubEnv('RELEASE_RESET_ENV', 'changed')
  expect(process.env.RELEASE_RESET_ENV).toBe('changed')
})
test('automatic reset before next case', () => {
  expect(process.env.RELEASE_RESET_ENV).toBeUndefined()
})
