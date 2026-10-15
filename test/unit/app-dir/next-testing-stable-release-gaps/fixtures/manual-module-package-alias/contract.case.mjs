import { test, expect, vi as vitest } from 'vitest'
import * as mocked from '#release-subject'
const order = vitest.hoisted(() => {
  globalThis.manualOrder = []
  return globalThis.manualOrder
})
vitest.mock('#release-subject')
test('manual redirects preserve namespace identity and live ESM values', async () => {
  expect(order).toEqual(['dependency', 'manual-start', 'manual-end'])
  expect(mocked.ready).toBe(true)
  expect(mocked.value).toBe(42)
  expect(mocked.manualOnly).toBe(true)
  expect('actualOnly' in mocked).toBe(false)
  expect(mocked.default()).toBe(42)
  expect(vitest.isMockFunction(mocked.default)).toBe(false)
  const direct = await import('./__mocks__/subject.mjs')
  expect(mocked).toBe(direct)
  expect(mocked.marker).toBe(direct.marker)
  expect(mocked.count).toBe(0)
  mocked.inc()
  expect(mocked.count).toBe(1)
  expect(direct.count).toBe(1)
  expect((await import('#release-subject')).count).toBe(1)
  const actual = await vitest.importActual('#release-subject')
  expect(actual.value).toBe(1)
  expect(actual.count).toBe(0)
  actual.inc()
  expect(actual.count).toBe(1)
  expect(mocked.count).toBe(1)
  expect(actual.marker).not.toBe(mocked.marker)
  expect(await vitest.importActual('#release-subject')).toBe(actual)
  expect(order).toEqual(['dependency', 'manual-start', 'manual-end', 'actual'])
})
