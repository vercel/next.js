import { value } from './a'
import { seenFromCycle } from './b'

it('registers cyclic re-exports before importing their source', () => {
  expect(seenFromCycle).toBe(true)
  expect(value()).toBe('ok')
})
