it('should ignore webpackIgnore comments', async () => {
  const _webpackImportIgnore = require(/* webpackIgnore: true */ './ignore.js')
  // just the fact that this doesn't fail in bundling is enough
})

it('should ignore turbopackIgnore comments', async () => {
  const _turbopackImportIgnore = require(/* turbopackIgnore: true */ './ignore.js')
  // just the fact that this doesn't fail in bundling is enough
})

it('should not ignore webpackIgnore comments', async () => {
  const webpackImportNotIgnore = require(/* webpackIgnore: false */ './util.js')
  expect(webpackImportNotIgnore).toBeDefined()
})

it('should not ignore turbopackIgnore comments', async () => {
  const turbopackImportNotIgnore = require(/* turbopackIgnore: false */ './util.js')
  expect(turbopackImportNotIgnore).toBeDefined()
})
