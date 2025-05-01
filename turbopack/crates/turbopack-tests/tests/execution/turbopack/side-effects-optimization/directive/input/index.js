import { foo } from './lib/index.js'

it('should respect side effects directive', () => {
  expect(foo).toBe(789)

  const modules = Object.keys(__turbopack_modules__)
  expect(modules).toContainEqual(expect.stringContaining('input/lib/foo'))
  expect(modules).not.toContainEqual(expect.stringContaining('input/lib/index'))
  expect(modules).not.toContainEqual(expect.stringContaining('input/lib/bar'))
})
