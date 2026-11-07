import { used, usedLate } from './lib.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('reads exports of a module.exports object literal and later assignments', () => {
  expect(used).toBe('used-value')
  expect(usedLate).toBe('used-late')
})

it('drops unused exports of the object literal and later assignments', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain('used:')
  // Writes to the discarded `exports` object (also reachable via top-level
  // `this`) are not exports and are dropped as well.
  expect(code).not.toContain('exports.early')
  expect(code).not.toContain('exports.deadExports')
  expect(code).not.toContain('deadThis =')
  expect(code).not.toContain("'deadDefined'")
  expect(code).not.toContain('unused:')
  expect(code).toContain('module.exports.usedLate =')
  expect(code).not.toContain('module.exports.unusedLate')
})
