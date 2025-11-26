import { a as a2, b as b2 } from 'package-star'
it('should optimize star reexports from side effect free module', () => {
  expect(a2).toBe('a')
  expect(b2).toBe('b')
})
