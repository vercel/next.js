import { b } from './lib.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('reads an export through a getter that reads another export', () => {
  expect(b).toBe('a-value')
})

it('does not drop an export that is read by another export', () => {
  // `b`'s getter reads `exports.a`, which taints the module.
  const code = moduleCode('lib.js')
  expect(code).toContain("Object.defineProperty(exports, 'a',")
  expect(code).toContain("Object.defineProperty(exports, 'b',")
})
