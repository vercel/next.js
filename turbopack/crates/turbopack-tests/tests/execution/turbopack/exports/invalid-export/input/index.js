it('should error when importing an invalid export', () => {
  // Either requiring should throw, or return undefined
  let ns
  try {
    ns = require('./invalid-export')
  } catch {
    return
  }
  expect(ns.default).toBe(undefined)
})
