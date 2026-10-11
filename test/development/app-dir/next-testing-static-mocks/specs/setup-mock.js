import { expect, test, vi } from 'vitest'
import { observed } from '../subject'

vi.mock(import('../dependency'), async (importOriginal) => ({
  ...(await importOriginal()),
  value: 'mock',
}))

test('setup runs once in the original graph before the mocked spec', () => {
  expect(globalThis.__nextMockSetup).toEqual({ calls: 1, value: 'original' })
  expect(observed).toEqual({
    value: 'mock',
    untouched: 'kept',
    fromLeaf: 'original leaf',
  })
})
