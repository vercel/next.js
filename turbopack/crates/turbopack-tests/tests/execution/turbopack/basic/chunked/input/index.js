import { foo } from 'foo'

it('imports a function from node_modules', () => {
  expect(foo(true)).toBe(true)
})
