it('reports a duplicate binding but still compiles the module', async () => {
  // `Table` is both imported and declared in `./duplicate.js`. This is reported
  // as an issue (see `issues/`), but the module is still emitted.
  const mod = await import('./duplicate.js')
  expect(typeof mod.Table).toBe('function')
})
