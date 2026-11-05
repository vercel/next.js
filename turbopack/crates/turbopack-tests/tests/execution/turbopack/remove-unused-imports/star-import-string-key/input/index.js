import * as lit from './lit.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes(`/input/${file} `)
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('narrows a namespace import accessed with a string-literal key', () => {
  expect(lit['foo']()).toBe('foo-value')

  // A string-literal key narrows to `foo`, so `unused` leaves the bundle.
  const code = moduleCode('lit.js')
  expect(code).toContain('foo-value')
  expect(code).not.toContain('unused-value')
})
