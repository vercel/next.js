import { used } from './lib.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('reads an export assigned via top-level `this`', () => {
  // The analysis doesn't see `used` as an export, which is reported as an
  // issue (see `issues/`), but it works at runtime.
  expect(used).toBe('used-value')
})

it('drops an unused export assigned via top-level `this`', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain(".used = 'used-value'")
  expect(code).not.toContain('.unused =')
})
