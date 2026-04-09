import {
  a as a0,
  b as b0,
  c as c0,
  d as d0,
  e as e0,
  def as def0,
} from 'package-named'
it('should optimize named reexports from side effect free module', () => {
  expect(a0).toBe('a')
  expect(b0).toBe('b')
  expect(c0).toBe('x')
  expect(d0).toBe('y')
  expect(e0).toBe('x')
  expect(def0).toBe('default')
})
