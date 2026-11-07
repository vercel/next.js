it('should be able to export an object literal', () => {
  expect(require('./direct-object').abc).toBe('abc')
  expect(require('./direct-object')).toEqual({ abc: 'abc', def: 'def' })
})

it('should be able to export an object literal indirect', () => {
  expect(require('./indirect-object').abc).toBe('abc')
  expect(require('./indirect-object')).toEqual({ abc: 'abc', def: 'def' })
})
