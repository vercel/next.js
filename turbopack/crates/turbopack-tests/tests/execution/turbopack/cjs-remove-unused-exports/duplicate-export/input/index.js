import { used } from './lib.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('uses the last assignment of an export assigned multiple times', () => {
  expect(used).toBe('second')
})

it('drops all assignments of an unused export assigned multiple times', () => {
  const code = moduleCode('lib.js')
  expect(code.match(/exports\.used =/g)).toHaveLength(2)
  expect(code).not.toContain('exports.unused')
})
