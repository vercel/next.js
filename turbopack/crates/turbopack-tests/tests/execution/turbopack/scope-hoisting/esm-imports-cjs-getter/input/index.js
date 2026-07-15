import { greet } from './cjs'

it('calls a getter-defined CJS export imported by ESM', () => {
  expect(typeof greet).toBe('function')
  expect(greet('world')).toBe('hi world')
})
