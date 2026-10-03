it('should not rewrite this nested in functions', () => {
  const f = require('./module').fff
  expect(f.test1).toBe(true)
  expect(f.test2).toBe(true)
})
