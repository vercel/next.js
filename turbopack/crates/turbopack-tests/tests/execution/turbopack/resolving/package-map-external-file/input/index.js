import fromApp from './app/index.js'

// This file is not within a package of the package map, so it has no
// dependencies: only requests that are not for a package resolve.

it('should resolve the dependencies of a file within a package', () => {
  expect(fromApp).toBe('dep')
})

it('should not resolve a package from a file that is not within any package', () => {
  expect(() => require('dep')).toThrow()
})
