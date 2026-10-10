it('should replace Object.defineProperty correctly with brackets', () => {
  expect(require('./module').test).toBe(true)
})
