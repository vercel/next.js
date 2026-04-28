import { used } from './lib'

it('should skip over module', () => {
  expect(used()).toBe('used')

  const modules = Array.from(__turbopack_modules__.keys())

  expect(modules).toContainEqual(expect.stringMatching(/lib\.js/))
  expect(modules).not.toContainEqual(expect.stringMatching(/locales\.js/))
  expect(modules).not.toContainEqual(expect.stringMatching(/locales-1\.js/))
  expect(modules).not.toContainEqual(expect.stringMatching(/util\.js/))
})
