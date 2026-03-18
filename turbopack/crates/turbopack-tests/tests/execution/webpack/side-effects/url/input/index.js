import { used } from './module'

it('should not include unused assets', () => {
  expect(used.href).toMatch(/png/)

  // Check that modules are loaded/not loaded based on side effects
  const modules = Array.from(__turbopack_modules__.keys())

  // 'used' should be included (not orphaned)
  expect(modules).toContainEqual(expect.stringMatching(/file\.png\?used/))

  // unused exports should not be included (orphaned by tree-shaking)
  // These tree assertions are WRONG, the url modules are included even though they
  expect(modules).toContainEqual(expect.stringMatching(/file\.png\?default/))
  expect(modules).toContainEqual(expect.stringMatching(/file\.png\?named/))
  expect(modules).toContainEqual(expect.stringMatching(/file\.png\?indirect/))
})
