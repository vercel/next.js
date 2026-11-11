import { test, expect, vi } from 'vitest'
test('environment stub persists by default', () => {
  vi.stubEnv('RELEASE_FILE_ENV', 'file')
  expect(process.env.RELEASE_FILE_ENV).toBe('file')
})
test('next case sees default persistent env', () => {
  expect(process.env.RELEASE_FILE_ENV).toBe('file')
  vi.unstubAllEnvs()
  expect(process.env.RELEASE_FILE_ENV).toBeUndefined()
})
