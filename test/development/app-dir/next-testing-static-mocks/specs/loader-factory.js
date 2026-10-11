import { test, expect, vi } from 'vitest'
import { observed } from '../subject'
const specValue = 'factory-before'
vi.mock('../dependency', () => ({
  value: 'factory-before',
  untouched: 'kept',
  fromLeaf: 'loader leaf',
}))
test('configured loader transforms the extracted factory at the original spec path', () => {
  expect(observed.value).toBe('factory-after!')
  expect(specValue).toBe('factory-after!')
})
