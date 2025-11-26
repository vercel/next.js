import {
  a as a1,
  b as b1,
  c as c1,
  d as d1,
  e as e1,
  local as local1,
  default as default1,
  def as def1,
} from 'package-named-local'
it('should optimize named reexports with locals from side effect free module', () => {
  expect(a1).toBe('a')
  expect(b1).toBe('b')
  expect(c1).toBe('x')
  expect(d1).toBe('y')
  expect(e1).toBe('x')
  expect(local1).toBe('local')
  expect(default1).toBe('local-default')
  expect(def1).toBe('default')
})
