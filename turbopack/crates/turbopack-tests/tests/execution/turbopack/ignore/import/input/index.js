it('should ignore webpackIgnore comments', async () => {
  const _webpackImportIgnore = await import(
    /* webpackIgnore: true */ './ignore.js'
  )
  // just the fact that this doesn't fail in bundling is enough
})

it('should ignore turbopackIgnore comments', async () => {
  const _turbopackImportIgnore = await import(
    /* turbopackIgnore: true */ './ignore.js'
  )
  // just the fact that this doesn't fail in bundling is enough
})

it('should not ignore webpackIgnore comments', async () => {
  const webpackImportNotIgnore = await import(
    /* webpackIgnore: false */ './util.js'
  )
  expect(webpackImportNotIgnore).toBeDefined()
})

it('should not ignore turbopackIgnore comments', async () => {
  const turbopackImportNotIgnore = await import(
    /* turbopackIgnore: false */ './util.js'
  )
  expect(turbopackImportNotIgnore).toBeDefined()
})
