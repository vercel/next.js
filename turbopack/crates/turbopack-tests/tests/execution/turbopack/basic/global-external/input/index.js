import foo from 'testGlobalExternalValue'

it('should access global external values', () => {
  expect(foo).toEqual({ bar: '11' })
  expect(foo.bar).toBe('11')
})
