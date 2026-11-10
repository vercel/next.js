import { foo, usage } from './module.js'

it('should expose __webpack_exports_info__ in tests', () => {
  expect(foo).toBe('foo')

  expect(usage.foo.used).toBe(true)
  expect(usage.bar.used).toBe(false)
  expect(usage.usage.used).toBe(true)
})
