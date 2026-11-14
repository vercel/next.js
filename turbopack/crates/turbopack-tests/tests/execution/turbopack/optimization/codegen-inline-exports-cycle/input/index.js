import { readA } from './b'

it('inlines across an import cycle without retaining the constants module', () => {
  expect(readA()).toBe('a')

  const source = readA.toString()
  expect(source).toContain('"a"')
  expect(source).toContain('TURBOPACK compile-time value')
  expect(source).not.toContain('return value')

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).toContainEqual(expect.stringMatching(/input\/b\.js/))
  expect(modules).not.toContainEqual(expect.stringMatching(/input\/a\.js/))
})
