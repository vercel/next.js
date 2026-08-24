// Without a `server_relative_root` there is nothing to resolve a `/`-rooted
// request from, so it keeps reporting that it isn't supported and resolves from
// the root of the filesystem. The value of this test is the `issues/` snapshot.

it('should report that a `/`-rooted request is not supported', () => {
  // `/input/dir/foo.js` only exists below this test's directory, so resolving it
  // from the root of the filesystem can't find it.
  expect(() => require('/input/dir/foo.js')).toThrow()
})
