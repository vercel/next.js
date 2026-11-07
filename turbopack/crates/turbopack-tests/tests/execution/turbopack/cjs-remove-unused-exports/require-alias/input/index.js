// `require` is aliased, so the require-usage analysis can't recognize the call.
// No usage is recorded for it, which must fail open: lib.js keeps *all* its
// exports (including `unused`) rather than being narrowed to just `.used`.
const myRequire = require

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('reads an export through an aliased require', () => {
  expect(myRequire('./lib.js').used).toBe('used-value')
})

it('keeps all exports of a module required through an alias', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain("exports.used = 'used-value'")
  expect(code).toContain("exports.unused = 'unused-value'")
})
