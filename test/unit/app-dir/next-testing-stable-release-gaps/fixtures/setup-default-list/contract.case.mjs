import { test, expect } from 'vitest'
test('default setup order is list in the pinned public runner', () => {
  expect(globalThis.releaseSetupTrace).toEqual([
    'a:start',
    'a:end',
    'b:start',
    'b:end',
  ])
})
