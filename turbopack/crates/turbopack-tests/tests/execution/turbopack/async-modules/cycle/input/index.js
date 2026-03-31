import { a, b } from './a-sync.js'

// index.js --> a-sync.js -> b-sync.js -> c-sync.js (-> back to a-sync.js)
//          \-> dep-async.js

it('should handle export all from cjs modules in modules with top level await', async () => {
  expect(a()).toBe('adep')
  expect(b()).toBe('bcadep')
})
