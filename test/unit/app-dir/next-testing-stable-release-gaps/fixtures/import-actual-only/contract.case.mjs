import { test, expect, vi } from 'vitest'
import * as imported from './subject.mjs'

test('literal actual import preserves the ordinary unmocked namespace', async () => {
  const actual = await vi.importActual('./subject.mjs')
  expect(actual).toBe(imported)
  expect(actual.value).toBe(1)
  expect(actual.marker).toBe(imported.marker)
  expect(await vi.importActual('./subject.mjs')).toBe(actual)
})
