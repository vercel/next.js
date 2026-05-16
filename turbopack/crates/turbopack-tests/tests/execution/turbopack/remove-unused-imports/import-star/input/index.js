import { used } from './a.js'

it('should error when importing an invalid export', () => {
  expect(used()).toBe(1234)

  // TODO we don't actually want x to be bundled, but currently we can't track this easily.
  // See the TODOs in turbopack/crates/turbopack-ecmascript/src/references/mod.rs
  expect(globalThis.xBundled).toBeTruthy()

  expect(globalThis.yBundled).toBeTruthy()
})
