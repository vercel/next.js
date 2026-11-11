import { expect, test, vi } from 'vitest'
import * as mocked from '../live-target'
import { count, increment, label } from '../live-target'

vi.mock(import('../live-target'), async (importOriginal) => {
  const first = await importOriginal()
  const second = await importOriginal()
  if (first !== second) throw new Error('original namespace identity changed')
  return { ...first, label: 'mock' }
})

test('copies spread exports and preserves the actual and mocked namespace identities', async () => {
  expect(count).toBe(0)
  expect(mocked.count).toBe(0)
  expect(label).toBe('mock')
  expect(mocked.label).toBe('mock')
  increment()
  expect(count).toBe(0)
  expect(mocked.count).toBe(0)
  const actual = await vi.importActual('../live-target')
  expect(actual.count).toBe(1)
  expect(await vi.importActual('../live-target')).toBe(actual)
  expect(await import('../live-target')).toBe(mocked)
})
