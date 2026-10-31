import m1 from './module'
import m2 from './module'
import { abc } from './module'

it('should allow to import cjs with esm', () => {
  expect(m1.abc).toBe('abc')
  expect(m2).toEqual({ abc: 'abc', def: 'def' })
  expect(abc).toBe('abc')
})
