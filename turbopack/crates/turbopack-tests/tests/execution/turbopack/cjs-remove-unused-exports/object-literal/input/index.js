import { used, usedFn, usedShort } from './lib.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('reads exports of a module.exports object literal', () => {
  expect(used).toBe('used-value')
  expect(usedFn()).toBe('used-fn')
  expect(usedShort).toBe('used-short')
})

it('drops unused properties of a module.exports object literal', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain('used:')
  expect(code).toContain('usedFn:')
  expect(code).toMatch(/\busedShort,/)
  expect(code).not.toContain('unused:')
  expect(code).not.toContain('unusedFn:')
  expect(code).not.toMatch(/\bunusedShort,/)
})
