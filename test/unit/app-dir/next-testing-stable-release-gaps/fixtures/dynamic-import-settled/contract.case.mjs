import { test, expect, vi } from 'vitest'
test('waits for unreturned nested imports', async () => {
  void import('./first.mjs')
  await vi.dynamicImportSettled()
  expect(globalThis.releaseImportTrace).toEqual(['first', 'second'])
})
