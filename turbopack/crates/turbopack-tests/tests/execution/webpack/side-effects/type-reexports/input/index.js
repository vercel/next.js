import { a, b } from './module'

import empty from './empty'

it('should skip over module', () => {
  expect(a).toBe('a')
  expect(b).toBe('b')

  // Check that module.js is optimized away (not loaded directly)
  // because it only re-exports from other modules
  const modules = Array.from(__turbopack_modules__.keys())

  // module.js should be optimized away by tree-shaking
  // (it's just a re-export aggregator with no side effects)
  expect(modules).not.toContainEqual(expect.stringMatching(/module\.js/))

  // But a.js and b.js should be loaded directly
  expect(modules).toContainEqual(expect.stringMatching(/a\.js/))
  expect(modules).toContainEqual(expect.stringMatching(/b\.js/))
})
