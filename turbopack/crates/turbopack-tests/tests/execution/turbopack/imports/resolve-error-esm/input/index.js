it('reports an unresolvable import and throws when evaluating it', async () => {
  // The resolve error is reported as an issue (see `issues/`) and the import
  // throws at runtime.
  await expect(import('./unresolvable.js')).rejects.toThrow(
    "Cannot find module 'does-not-exist/path'"
  )
})
