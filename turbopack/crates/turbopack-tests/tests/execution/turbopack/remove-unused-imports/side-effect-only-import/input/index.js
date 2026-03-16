// This test validates that side-effect-only imports to side-effect-free modules are removed
// This is the simple case where we import a module purely for side effects

import './library/side-effect-free.js'

it('should not bundle side-effect-only import of side-effect-free module', () => {
  // The module is marked side-effect-free via package.json
  // We only import it for side effects (no named imports)
  // So it should be completely removed
  expect(globalThis.sideEffectFreeBundled).toBeUndefined()
})
