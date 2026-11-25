it('should still tree-shake when this appears in static blocks and class fields', () => {
  const m = require('./module-inner')
  expect(m.a()).toBe(2)
  // expect(m.usedExports).toEqual(["a", "usedExports"]);
})
