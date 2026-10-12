// Without a directory to resolve a `/`-rooted request from, a `/`-rooted pattern
// isn't supported either: it reports that and matches nothing, rather than
// falling back to the root of the filesystem.
//
// The pattern below is deliberately spelled from the root of the filesystem, so
// it *would* match `dir/foo.js` if that root were used. It must not.

const absolute = import.meta.glob(
  '/turbopack/crates/turbopack-tests/tests/execution/turbopack/resolving/import-meta-glob-no-root/input/dir/*.js',
  { eager: true }
)

it('should not match a `/`-rooted pattern', () => {
  expect(absolute).toEqual({})
})

// A relative pattern is unaffected.
const relative = import.meta.glob('./dir/*.js', { eager: true })

it('should still match a relative pattern', () => {
  expect(Object.keys(relative)).toEqual(['./dir/foo.js'])
})
