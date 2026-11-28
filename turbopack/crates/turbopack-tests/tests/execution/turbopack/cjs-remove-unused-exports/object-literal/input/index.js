import { used, usedFn, usedShort } from './lib.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('reads exports of a module.exports object literal', () => {
  expect(used).toBe('used-value')
  expect(usedFn()).toBe('used-fn')
  expect(usedShort).toBe('used-short')
})

it('drops unused properties of a module.exports object literal', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain('used:')
  expect(code).toContain('usedFn:')
  expect(code).toMatch(/\busedShort,/)
  expect(code).not.toContain('unused:')
  expect(code).not.toContain('unusedFn:')
  expect(code).not.toMatch(/\bunusedShort,/)
})
