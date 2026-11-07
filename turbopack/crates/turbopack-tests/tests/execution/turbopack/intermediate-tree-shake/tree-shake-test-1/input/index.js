import { getCat } from 'lib'

it('imports a function from a side-effect-free module', () => {
  expect(`I like ${getCat()}`).toBe('I like cat')
})

it('only exports the used function', () => {
  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.includes('/node_modules/lib/index.js ')
  )
  expect(ids).toHaveLength(1)
  const code = __turbopack_modules__.get(ids[0]).toString()
  const registration = code.match(/\.s\(\[([\s\S]*?)\]\)/)[1]
  expect(registration).toMatch(/\bgetCat\b/)
  // Built dynamically so this test file itself doesn't contain the names.
  expect(registration).not.toContain(['get', 'Dog'].join(''))
  expect(registration).not.toContain(['get', 'Chimera'].join(''))
})
