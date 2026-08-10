import { a } from './a'

it('should keep circular dependencies when one is used', () => {
  expect(a).toBe('a')
  expect(globalThis.aBundled).toBe(true)
  // b is trimmed because it is annotated as side effect free and only used via
  expect(globalThis.bBundled).toBeUndefined()
})
