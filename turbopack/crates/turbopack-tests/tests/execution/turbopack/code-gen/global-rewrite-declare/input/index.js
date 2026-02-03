import { foo } from './foo'

it('should rewrite global', () => {
  // Workaround because the tests run in a Node.js environment where `global` is always defined
  delete globalThis.global

  globalThis.something = 1234
  expect(foo()).toBe(1234)

  globalThis.global = globalThis
})
