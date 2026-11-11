import { test, expect, vi } from 'vitest'
import { value } from './subject.mjs'
const order = vi.hoisted(() => {
  globalThis.manualOrder = []
  return globalThis.manualOrder
})
vi.mock('./subject.mjs', () => ({ value: 43 }))
vi.mock('./subject.mjs')
test('last declaration selects manual', async () => {
  expect(value).toBe(42)
  expect(order).toEqual(['dependency', 'manual-start', 'manual-end'])
  const actual = await vi.importActual('./subject.mjs')
  expect(actual.value).toBe(1)
})
