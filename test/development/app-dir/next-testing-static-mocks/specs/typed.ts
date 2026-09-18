import { test, expect, vi } from 'vitest'
import { observed } from '../subject'
vi.mock(import('../dependency'), () => {
  const value: string = 'typed'
  return { value, untouched: 'typed original', fromLeaf: 'typed leaf' }
})
test('factory TypeScript is compiled by Next', () => {
  expect(observed.value).toBe('typed')
})
