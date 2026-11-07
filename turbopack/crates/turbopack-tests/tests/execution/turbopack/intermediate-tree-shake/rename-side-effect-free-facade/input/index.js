import { a0 } from 'lib'

function isBundled(file) {
  return Array.from(__turbopack_modules__.keys()).some((id) =>
    id.includes(`/node_modules/lib/${file} `)
  )
}

it('imports a renamed reexport of a side-effect-free facade', () => {
  expect(a0).toBe('a')
})

it('skips the side-effect-free facade module', () => {
  expect(isBundled('a.js')).toBe(true)
  expect(isBundled('index.js')).toBe(false)
  expect(isBundled('b.js')).toBe(false)
})
