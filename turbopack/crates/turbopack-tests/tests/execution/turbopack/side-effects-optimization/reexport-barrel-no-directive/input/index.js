import { foo } from './lib/index.js'

it('should tree-shake barrel files with only re-exports even without sideEffects: false', () => {
  expect(foo).toBe('foo-value')

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).toContainEqual(expect.stringContaining('input/lib/foo'))

  // The barrel file (index) should NOT be included - it only has re-exports
  // and should be recognized as ModuleEvaluationIsSideEffectFree
  expect(modules).not.toContainEqual(expect.stringContaining('input/lib/index'))

  // Unused re-exports should NOT be included
  expect(modules).not.toContainEqual(expect.stringContaining('input/lib/bar'))
})
