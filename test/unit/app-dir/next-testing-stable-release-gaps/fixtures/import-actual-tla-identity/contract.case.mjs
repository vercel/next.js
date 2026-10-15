import { test, expect, vi } from 'vitest'

vi.mock('./subject.mjs', () => ({ value: 42 }))

test('repeated actual imports await one original module evaluation', async () => {
  const [first, second] = await Promise.all([
    vi.importActual('./subject.mjs'),
    vi.importActual('./subject.mjs'),
  ])
  expect(first).toBe(second)
  expect(first.ready).toBe(true)
  expect(first.value).toBe(1)
  expect(first.evaluations).toBe(1)
  expect(first.marker).toBe(second.marker)
  expect(await vi.importActual('./subject.mjs')).toBe(first)
  expect((await import('./subject.mjs')).value).toBe(42)
})
