it('runs give an empty object for an ignored module', () => {
  expect(require('package')).toEqual({})
})
