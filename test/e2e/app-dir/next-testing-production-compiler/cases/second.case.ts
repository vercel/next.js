import { expect, test } from 'vitest'
import { secondValue } from '../lib/value'
test('retains a second independently optimized graph', () => {
  expect(secondValue).toBe('disjoint second export')
})
