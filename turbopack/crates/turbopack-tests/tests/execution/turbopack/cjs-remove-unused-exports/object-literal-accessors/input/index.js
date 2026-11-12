import { used, usedGetter } from './lib.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('reads data and getter exports of a module.exports object literal', () => {
  expect(used).toBe('used-value')
  expect(usedGetter).toBe('used-getter')
})

it('drops unused getters and methods of a module.exports object literal', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain('get usedGetter')
  expect(code).not.toContain('unusedGetter')
  expect(code).not.toContain('unused-getter')
  expect(code).not.toContain('unusedMethod')
  expect(code).not.toContain('unused-method')
})
