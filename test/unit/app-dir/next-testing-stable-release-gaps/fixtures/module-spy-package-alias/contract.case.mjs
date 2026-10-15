import { test, expect, vi as vitest } from 'vitest'
import defaultFn, {
  fn,
  alias,
  primitive,
  array,
  Box,
  nested,
  count,
  inc,
  evaluations,
} from '#release-subject'
const order = vitest.hoisted(() => {
  globalThis.spyOrder = []
  return globalThis.spyOrder
})
vitest.mock('#release-subject', { spy: true })
test('module spies preserve behavior with independent actual state', async () => {
  expect(order).toEqual(['original'])
  expect(evaluations).toBe(1)
  expect(primitive).toBe(7)
  expect(array).toEqual([1, 2, 3])
  expect(alias).toBe(fn)
  expect(nested.fn).toBe(fn)
  expect(nested.secret).toBe(5)
  expect(vitest.isMockFunction(fn)).toBe(true)
  expect(fn(2)).toBe(44)
  expect(fn).toHaveBeenCalledExactlyOnceWith(2)
  expect(vitest.isMockFunction(defaultFn)).toBe(true)
  expect(defaultFn()).toBe(99)
  const first = new Box(5)
  const second = new Box(7)
  expect(first.method()).toBe(5)
  expect(Box.prototype.method).toHaveBeenCalledOnce()
  expect(first.method).not.toBe(second.method)
  expect(inc()).toBe(1)
  expect(count).toBe(0)
  const actual = await vitest.importActual('#release-subject')
  expect(order).toEqual(['original', 'original'])
  expect(actual.evaluations).toBe(2)
  expect(actual.count).toBe(0)
  expect(actual.inc()).toBe(1)
  expect(actual.count).toBe(1)
  expect(count).toBe(0)
  expect(actual.fn(2)).toBe(44)
  expect(fn).toHaveBeenCalledOnce()
  expect(vitest.isMockFunction(actual.fn)).toBe(false)
  expect(await vitest.importActual('#release-subject')).toBe(actual)
  expect((await import('#release-subject')).count).toBe(0)
  vitest.clearAllMocks()
  expect(fn).not.toHaveBeenCalled()
  fn.mockReturnValue(3)
  expect(fn()).toBe(3)
  vitest.resetAllMocks()
  expect(fn(2)).toBe(44)
  expect(fn).toHaveBeenCalledExactlyOnceWith(2)
  vitest.restoreAllMocks()
  expect(vitest.isMockFunction(fn)).toBe(true)
  expect(fn).toHaveBeenCalledOnce()
  expect(fn(3)).toBe(45)
})
