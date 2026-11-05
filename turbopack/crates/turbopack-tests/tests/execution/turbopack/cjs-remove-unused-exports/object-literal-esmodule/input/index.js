import lib, { used } from './lib.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('reads an export of a module.exports object literal with __esModule', () => {
  expect(used).toBe('used-value')
})

it('keeps the __esModule marker and its interop semantics', () => {
  // With `__esModule`, the default import is `exports.default`, not the whole
  // `module.exports` object.
  expect(lib).toBe('default-value')

  const code = moduleCode('lib.js')
  expect(code).toContain('__esModule: true')
})

it('drops an unused export of a module.exports object literal with __esModule', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain('used:')
  expect(code).not.toContain('unused:')
})
