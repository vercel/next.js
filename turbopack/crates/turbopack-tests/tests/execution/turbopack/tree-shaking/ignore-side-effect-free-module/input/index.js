import { used } from './json.js'
import { used as used2 } from './js.js'
import { used as used3 } from './cjs.js'

it('should tree shake all unused modules', () => {
  expect(used).toEqual({ used: true })
  expect(used2).toBe(true)
  expect(used3).toBe(true)

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).toContainEqual(expect.stringMatching(/input\/json\.js/))
  expect(modules).toContainEqual(expect.stringMatching(/input\/used\.json/))
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/unused\.json/)
  )
  expect(modules).toContainEqual(expect.stringMatching(/input\/js\.js/))
  expect(modules).toContainEqual(expect.stringMatching(/input\/used\.js/))
  expect(modules).not.toContainEqual(expect.stringMatching(/input\/unused\.js/))
  expect(modules).toContainEqual(expect.stringMatching(/input\/cjs\.js/))
  expect(modules).toContainEqual(expect.stringMatching(/input\/used\.cjs/))
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/unused\.cjs/)
  )
})
