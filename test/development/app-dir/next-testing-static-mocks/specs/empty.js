import { test, expect, vi } from 'vitest'
import * as namespace from '../empty-target'
vi.mock('../empty-target', () => ({}))
test('empty factory exports an empty namespace and suppresses original side effects', () => {
  expect(Object.keys(namespace)).toEqual([])
  expect(globalThis.__nextEmptyOriginal).toBeUndefined()
})
