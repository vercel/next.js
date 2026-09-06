import { used } from './lib.js'

it('keeps a used named CommonJS export', () => {
  expect(used).toBe('used-value')
})

it('preserves the side effects of an unused-but-impure export write', () => {
  // `exports.impure` is never imported, but its RHS has a side effect, so the
  // write must not be dropped.
  expect(globalThis.__cjs_impure_ran).toBe(true)
})
