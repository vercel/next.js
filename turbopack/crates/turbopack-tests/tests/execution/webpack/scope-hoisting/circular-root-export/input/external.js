import { a, b, c, default as d, e, e_var } from './root'

expect(a()).toBe('a')
if (process.env.NODE_ENV === 'production') {
  // These two cases only work correctly when scope hoisted
  expect(b()).toBe('b')
  expect(Object(c).b()).toBe('b')
}
expect(() => d).toThrow()
expect(() => e).toThrow()
expect(e_var).toBeUndefined()

export function test() {
  expect(d).toBe(d)
}
