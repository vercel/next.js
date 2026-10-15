import { test, expect, vi } from 'vitest'
import { value } from './subject.mjs'
const order = vi.hoisted(() => {
  globalThis.manualOrder = []
  return globalThis.manualOrder
})
vi.mock('./subject.mjs')
vi.mock('./subject.mjs', () => ({ value: 43 }))
test('last declaration selects factory', async () => {
  expect(value).toBe(43)
  expect(order).toEqual([])
  const actual = await vi.importActual('./subject.mjs')
  expect(actual.value).toBe(1)
})
