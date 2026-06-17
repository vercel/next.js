import { foo } from './internal/index.js'

it('should correctly rename imports', () => {
  expect(foo({})).toBe(true)
})
