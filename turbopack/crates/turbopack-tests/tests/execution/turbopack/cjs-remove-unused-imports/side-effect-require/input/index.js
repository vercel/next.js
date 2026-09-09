globalThis.__cjs_effect_ran = false

require('./effect.js')

it('keeps a bare require to a side-effectful module', () => {
  expect(globalThis.__cjs_effect_ran).toBe(true)
})
