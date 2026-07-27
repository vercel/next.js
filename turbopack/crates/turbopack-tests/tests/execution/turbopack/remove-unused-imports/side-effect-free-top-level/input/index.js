import './a.js'

it('should not bundle side-effect-free module transitively imported from unused module', () => {
  // a.js re-exports noop from './library/side-effect-free.js'
  // But nothing from a.js is imported/used
  // Since library/side-effect-free.js has no side effects (local analysis),
  // the import should be removed
  expect(globalThis.sideEffectFreeBundled).toBeUndefined()

  // But a.js also imports something with actual side effects at top-level
  // That should still be bundled
  expect(globalThis.sideEffectfulBundled).toBeTruthy()
})
