import { test, expect, vi } from 'vitest'
import exportedPromise from './promise.cjs'
import { delay } from './delay.mjs'
void delay
test('settles delayed nested modules with real deadlines and ignores promise exports', async () => {
  expect(typeof exportedPromise.then).toBe('function')
  vi.useFakeTimers()
  try {
    void import('./first.mjs')
    expect(await vi.dynamicImportSettled()).toBeUndefined()
    expect(globalThis.releaseDelayedImports).toEqual(['first', 'second'])
  } finally {
    vi.useRealTimers()
  }
})
