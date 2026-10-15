import { test, expect, vi } from 'vitest'
import { value, marker, increment, count } from './subject.mjs'

vi.mock('./subject.mjs', async () => {
  const actual = await vi.importActual('./subject.mjs')
  return { ...actual, value: 42 }
})

test('literal actual import supports a partial factory and original identity', async () => {
  const actual = await vi.importActual('./subject.mjs')
  expect(value).toBe(42)
  expect(actual.value).toBe(1)
  expect(marker).toBe(actual.marker)
  expect(increment).toBe(actual.increment)
  expect(count).toBe(0)
  increment()
  expect(actual.count).toBe(1)
  expect(count).toBe(0)
  expect((await import('./subject.mjs')).count).toBe(0)
  expect(await vi.importActual('./subject.mjs')).toBe(actual)
})
