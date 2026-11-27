it('reports an unresolvable require and throws when evaluating it', () => {
  // The resolve error is reported as an issue (see `issues/`) and the require
  // throws at runtime.
  expect(() => require('does-not-exist/path')).toThrow(
    "Cannot find module 'does-not-exist/path'"
  )
})
