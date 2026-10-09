import { test, expect, vi } from 'vitest'
import { observed } from '../subject'
import { second } from '../second-subject'

vi.mock('@/dependency', async (importOriginal) => {
  globalThis.__nextFactoryCalls = (globalThis.__nextFactoryCalls || 0) + 1
  await Promise.resolve()
  return { ...(await importOriginal()), value: 'mock' }
})
vi.mock('../leaf', () => ({ leaf: 'mock leaf' }))

test('static factories precede subject evaluation and retain mocked original dependencies', () => {
  expect(observed).toEqual({
    value: 'mock',
    untouched: 'kept',
    fromLeaf: 'mock leaf',
  })
  expect(second).toBe('mock')
  expect(globalThis.__nextFactoryCalls).toBe(1)
})
