// Regression test for https://github.com/swc-project/swc/issues/11322
it('should preserve required parens in logical expressions', () => {
  let x = 2

  ;((function (a) {
    return a
  })(x) && x,
    x)

  expect(x).toBe(4)
})
