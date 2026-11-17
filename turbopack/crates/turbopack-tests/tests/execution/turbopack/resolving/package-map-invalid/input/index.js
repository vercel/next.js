import relative from './relative.js'

it('should not resolve any package with an invalid package map', () => {
  // The `node_modules` folders are not a fallback.
  expect(() => require('dep')).toThrow()
})

it('should still resolve requests that are not for a package', () => {
  expect(relative).toBe('relative')
})
