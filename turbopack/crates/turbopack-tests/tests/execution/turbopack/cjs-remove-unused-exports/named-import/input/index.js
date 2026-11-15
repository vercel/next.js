import { used } from './lib.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('keeps a used named CommonJS export', () => {
  expect(used).toBe('used-value')
})

it('preserves the side effects of an unused-but-impure export write', () => {
  // `exports.impure` is never imported, but its RHS has a side effect, so the
  // write must not be dropped.
  expect(globalThis.__cjs_impure_ran).toBe(true)
})

it('drops an unused-and-pure named CommonJS export', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain("exports.used = 'used-value'")
  expect(code).not.toContain('exports.unused')
})
