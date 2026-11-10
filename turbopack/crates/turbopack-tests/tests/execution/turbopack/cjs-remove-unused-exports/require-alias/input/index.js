// `require` is aliased, so the require-usage analysis can't recognize the call.
// No usage is recorded for it, which must fail open: lib.js keeps *all* its
// exports (including `unused`) rather than being narrowed to just `.used`.
const myRequire = require

const { moduleCode } = require('../../../__helpers__/module-factories.js')

it('reads an export through an aliased require', () => {
  expect(myRequire('./lib.js').used).toBe('used-value')
})

it('keeps all exports of a module required through an alias', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain("exports.used = 'used-value'")
  expect(code).toContain("exports.unused = 'unused-value'")
})
