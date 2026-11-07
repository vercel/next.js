import { used } from './lib.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('reads an export declared via Object.defineProperty', () => {
  expect(used).toBe('used-value')
})

it('drops an unused export declared via Object.defineProperty', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain("Object.defineProperty(exports, '__esModule',")
  expect(code).toContain("Object.defineProperty(exports, 'used',")
  expect(code).not.toContain("Object.defineProperty(exports, 'unused',")
})
