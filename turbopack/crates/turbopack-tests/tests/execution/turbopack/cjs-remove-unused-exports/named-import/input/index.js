import { used } from './lib.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

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
