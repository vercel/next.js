import { seenFromCycle, value } from './b'

it('registers cyclic re-exports before importing their source', () => {
  expect(seenFromCycle).toBe('function')
  expect(value()).toBe('ok')
})
