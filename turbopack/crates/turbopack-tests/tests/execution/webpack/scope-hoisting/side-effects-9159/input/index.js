it('should reexport from side-effect-free scope-hoisted module', () => {
  const m = require('./reexport')
  expect(m.value).toBe(42)
  expect(m.ns.default).toBe(42)
})
