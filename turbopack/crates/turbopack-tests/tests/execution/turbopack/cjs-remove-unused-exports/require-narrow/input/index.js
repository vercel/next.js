const { used } = require('./lib.js')

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

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
