import { used } from './lib.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('uses the last assignment of an export assigned multiple times', () => {
  expect(used).toBe('second')
})

it('drops all assignments of an unused export assigned multiple times', () => {
  const code = moduleCode('lib.js')
  expect(code.match(/exports\.used =/g)).toHaveLength(2)
  expect(code).not.toContain('exports.unused')
})
