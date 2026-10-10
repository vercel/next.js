// Without a `server_relative_root` there is nothing to resolve a `/`-rooted
// request from, so it isn't supported: it reports an issue and doesn't resolve.
//
// `/package.json` exists at the root of the filesystem (the repository root), so
// guessing at that root would resolve it. It must not: reporting the request as
// unsupported and then resolving it anyway would contradict itself.

it('should not resolve a `/`-rooted request', () => {
  expect(() => require('/package.json')).toThrow()
})

it('should not resolve one below the importing directory either', () => {
  expect(() => require('/input/dir/foo.js')).toThrow()
})
