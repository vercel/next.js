import { test, expect } from 'vitest'
test('setup files preserve explicit list ordering', () =>
  expect(globalThis.releaseSetup).toEqual(['first', 'second']))
