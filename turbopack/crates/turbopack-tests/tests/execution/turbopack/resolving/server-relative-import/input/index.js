// A request starting with `/` is resolved from the project directory, not from
// the root of the filesystem. Here the project directory is this test's own
// directory, so `/input/dir/foo.js` is the file next to this one.
//
// Vite's rule: a request is either relative to the importing file or absolute
// from the project root.
// https://vite.dev/guide/features.html#glob-import-caveats

import foo from '/input/dir/foo.js'

it('should resolve a `/`-rooted import from the project directory', () => {
  expect(foo).toBe('foo')
})

it('should resolve a `/`-rooted require from the project directory', () => {
  expect(require('/input/dir/bar.js')).toBe('bar')
})
