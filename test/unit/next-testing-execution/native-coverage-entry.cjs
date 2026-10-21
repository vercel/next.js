const paths = require('./runtime-paths.json')
exports.testRunner = require(paths.runner)
exports.loadTestModule = async () => {
  const { test } = require(paths.vitest)
  test('settled native body assertion', async ({ expect }) => {
    expect(Promise.resolve(1)).resolves.toBe(2)
  })
  test('following body', ({ expect }) => expect(true).toBe(true))
}
