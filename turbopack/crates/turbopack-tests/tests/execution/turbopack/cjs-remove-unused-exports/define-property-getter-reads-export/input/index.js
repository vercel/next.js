import { b } from './lib.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('reads an export through a getter that reads another export', () => {
  expect(b).toBe('a-value')
})

it('does not drop an export that is read by another export', () => {
  // `b`'s getter reads `exports.a`, which taints the module.
  const code = moduleCode('lib.js')
  expect(code).toContain("Object.defineProperty(exports, 'a',")
  expect(code).toContain("Object.defineProperty(exports, 'b',")
})
