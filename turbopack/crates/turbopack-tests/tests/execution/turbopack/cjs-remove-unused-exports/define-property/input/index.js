import { used } from './lib.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('reads an export declared via Object.defineProperty', () => {
  expect(used).toBe('used-value')
})

it('drops an unused export declared via Object.defineProperty', () => {
  const code = moduleCode('lib.js')
  expect(code).toContain("Object.defineProperty(exports, '__esModule',")
  expect(code).toContain("Object.defineProperty(exports, 'used',")
  expect(code).not.toContain("Object.defineProperty(exports, 'unused',")
})
