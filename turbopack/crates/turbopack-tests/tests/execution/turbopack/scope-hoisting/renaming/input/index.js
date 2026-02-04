import { useComputed } from './use-computed.js'
const increment = (i) => i + 1

it('should correctly handle variable collisions', () => {
  let i = 123

  expect(i).toBe(123)
  expect(useComputed).toBe('abc')
  expect(increment(1)).toBe(2)
})
