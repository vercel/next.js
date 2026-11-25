const { used } = require('./lib.js')
const { moduleCode } = require('../../../__helpers__/module-factories.js')

it('reads a destructured CommonJS export (siblings narrowed away)', () => {
  expect(used).toBe('used-value')

  // Only `used` is destructured, so `exports.unused` is dropped.
  const code = moduleCode('lib.js')
  expect(code).toContain("exports.used = 'used-value'")
  expect(code).not.toContain('exports.unused')
})

it('reads a member-accessed CommonJS export (siblings narrowed away)', () => {
  expect(require('./lib2.js').used).toBe('used2-value')

  // Only `.used` is read off the require result, so `exports.unused` is
  // dropped.
  const code = moduleCode('lib2.js')
  expect(code).toContain("exports.used = 'used2-value'")
  expect(code).not.toContain('exports.unused')
})
