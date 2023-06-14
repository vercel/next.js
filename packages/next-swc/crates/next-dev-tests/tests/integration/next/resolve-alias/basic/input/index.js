import foo from 'foo'
import foo2 from 'foo2'

it('aliases foo to bar through the next.config.js experimental.turbopack.resolveAlias property', () => {
  expect(foo).toBe(42)
})

it('aliases foo2 to bar through the next.config.js experimental.turbopack.resolveAlias property with export condition', () => {
  expect(foo2).toBe(42)
})
