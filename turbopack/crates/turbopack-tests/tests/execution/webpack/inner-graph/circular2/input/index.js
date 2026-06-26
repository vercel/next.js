import { x, y, z, a, f3 } from './module'

it('should be able to handle circular referenced', () => {
  expect(x()).toEqual([y, z])
  const [_a, b, c, d] = a()
  expect(b()).toEqual([a, b, c, d])
  expect(c()).toEqual([a, b, c, d])
  expect(d()).toEqual([a, b, c, d])
  const [f2, f4] = f3()
  const [f1, _f3] = f2()
  expect(_f3).toBe(f3)
  expect(f3()).toEqual(f1())
  expect(f2()).toEqual(f4())
})
