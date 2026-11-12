import { test, expect, vi } from 'vitest'
import * as mocked from './subject.mjs'
const order = vi.hoisted(() => {
  globalThis.manualOrder = []
  return globalThis.manualOrder
})
vi.mock(import('./subject.mjs'))
test('manual redirects preserve namespace identity and live ESM values', async () => {
  expect(order).toEqual(['dependency', 'manual-start', 'manual-end'])
  expect(mocked.ready).toBe(true)
  expect(mocked.value).toBe(42)
  expect(mocked.manualOnly).toBe(true)
  expect('actualOnly' in mocked).toBe(false)
  expect(mocked.default()).toBe(42)
  expect(vi.isMockFunction(mocked.default)).toBe(false)
  const direct = await import('./__mocks__/subject.mjs')
  expect(mocked).toBe(direct)
  expect(mocked.marker).toBe(direct.marker)
  expect(mocked.count).toBe(0)
  mocked.inc()
  expect(mocked.count).toBe(1)
  expect(direct.count).toBe(1)
  expect((await import('./subject.mjs')).count).toBe(1)
  const actual = await vi.importActual('./subject.mjs')
  expect(actual.value).toBe(1)
  expect(actual.count).toBe(0)
  actual.inc()
  expect(actual.count).toBe(1)
  expect(mocked.count).toBe(1)
  expect(actual.marker).not.toBe(mocked.marker)
  expect(await vi.importActual('./subject.mjs')).toBe(actual)
  expect(order).toEqual(['dependency', 'manual-start', 'manual-end', 'actual'])
})
