it('should check existing variables when renaming', function () {
  expect(require('./module').d.x()).toBe('ok')
  expect(require('./module').c.a()).toBe('ok')
  expect(require('./module').test()).toBe('ok')
})
