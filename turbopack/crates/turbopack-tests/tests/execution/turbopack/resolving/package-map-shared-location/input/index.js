import { common, loadPeer, loadOnlyOld } from 'lib'

// `lib-old` and `lib-new` share one location. A module doesn't carry the ID of
// its package, so an import from that location only resolves when it leads to
// the same place from both packages.

it('should resolve a dependency that the packages sharing a location agree on', () => {
  expect(common).toBe('common@1.0.0')
})

it('should not resolve a dependency that the packages sharing a location disagree on', () => {
  expect(loadPeer).toThrow()
  expect(loadOnlyOld).toThrow()
})
