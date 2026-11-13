import { used } from './lib.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('reads an export assigned via top-level `this`', () => {
  // Top-level `this` is `module.exports`, so `used` is a known export.
  expect(used).toBe('used-value')
})

it('drops an unused export assigned via top-level `this`', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain(".used = 'used-value'")
  expect(code).not.toContain('.unused =')
})
