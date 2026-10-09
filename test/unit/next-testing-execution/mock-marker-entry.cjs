// Controlled bootstrap for the real worker protocol, not a compiled graph.
const assert = require('node:assert/strict')
const paths = require('./runtime-paths.json')
const testRunner = require(paths.runner)
const runtime = require(paths.mocking)
let initialized = 0

exports.testRunner = testRunner
if (paths.expose) {
  exports.mockTesting = {
    ...runtime,
    initializeModuleMocking(options) {
      initialized++
      return runtime.initializeModuleMocking(options)
    },
  }
}
exports.loadTestModule = async () => {
  assert.equal(initialized, paths.marked ? 1 : 0)
  const register = () =>
    runtime.registerModuleMock(
      'worker-protocol-target',
      () => ({ value: 'mock' }),
      async () => ({ value: 'original' })
    )
  if (paths.marked) {
    register()
    assert.deepEqual(
      await runtime.resolveModuleMock('worker-protocol-target', ['value']),
      { value: 'mock' }
    )
  } else {
    assert.throws(register, /requires an initialized Next-compiled test file/)
  }
  testRunner
    .getTestApi()
    .test('compiler marker controls mock activation', () => {})
}
