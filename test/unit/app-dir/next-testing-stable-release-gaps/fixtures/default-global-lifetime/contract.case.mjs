import { test, expect, vi } from 'vitest'
test('stub remains for the file by default', () => {
  vi.stubGlobal('releaseFileValue', 42)
  expect(globalThis.releaseFileValue).toBe(42)
})
test('next case sees default persistent stub', () => {
  expect(globalThis.releaseFileValue).toBe(42)
  vi.unstubAllGlobals()
  expect('releaseFileValue' in globalThis).toBe(false)
})
