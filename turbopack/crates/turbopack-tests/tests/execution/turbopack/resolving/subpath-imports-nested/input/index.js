import foo from './nested'

it('should resolve nested subpath imports', () => {
  expect(foo).toBe('foo')
})
