import { a, b } from './a-sync.js'

it('should handle export all from cjs modules in modules with top level await', async () => {
  expect(a()).toBe('adep')
  expect(b()).toBe('bcadep')
})
