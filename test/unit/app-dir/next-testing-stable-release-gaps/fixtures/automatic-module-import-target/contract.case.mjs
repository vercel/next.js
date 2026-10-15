import { test, expect, vi } from 'vitest'
import defaultFn, {
  fn,
  alias,
  primitive,
  array,
  Box,
  shared,
  nested,
} from './subject.mjs'
const order = vi.hoisted(() => {
  globalThis.autoMockOrder = []
  return globalThis.autoMockOrder
})
vi.mock(import('./subject.mjs'))
test('automatic mocks clone exports and share tracked spies', async () => {
  expect(order).toEqual(['original'])
  const actual = await vi.importActual('./subject.mjs')
  expect(primitive).toBe(7)
  expect(array).toEqual([])
  expect(array).not.toBe(actual.array)
  expect(shared).not.toBe(actual.shared)
  expect(shared.self).toBe(shared)
  expect(nested.shared).toBe(shared)
  expect(nested.fn).toBe(fn)
  expect(nested.secret).toBeUndefined()
  expect(alias).toBe(fn)
  expect(vi.isMockFunction(fn)).toBe(true)
  expect(fn(2)).toBeUndefined()
  expect(fn).toHaveBeenCalledExactlyOnceWith(2)
  expect(actual.fn(2)).toBe(44)
  expect(vi.isMockFunction(defaultFn)).toBe(true)
  expect(defaultFn()).toBeUndefined()
  expect(vi.isMockFunction(Box)).toBe(true)
  const first = new Box()
  const second = new Box()
  expect(first.method()).toBeUndefined()
  expect(Box.prototype.method).toHaveBeenCalledOnce()
  expect(first.method).not.toBe(second.method)
  expect(order).toEqual(['original', 'original'])
  expect(actual.array).toEqual([1, 2, 3])
  vi.clearAllMocks()
  expect(fn).not.toHaveBeenCalled()
  fn.mockReturnValue(3)
  expect(fn()).toBe(3)
  vi.resetAllMocks()
  expect(fn()).toBeUndefined()
  expect(await vi.importActual('./subject.mjs')).toBe(actual)
})
