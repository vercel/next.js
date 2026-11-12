// The result of this bare require is discarded, and the target is side-effect
// free, so the `require(...)` call is replaced with a `0` placeholder (later
// removed by minification) instead of loading the module.
const { hasModuleFactory } = require('../../../__helpers__/module-factories.js')

function bareRequire() {
  require('./pure.js')
  return 'kept'
}

it('removes a discarded require of a side-effect-free module', () => {
  expect(bareRequire()).toBe('kept')

  expect(bareRequire.toString()).not.toContain('pure.js')
  expect(hasModuleFactory('pure.js')).toBe(false)
})
