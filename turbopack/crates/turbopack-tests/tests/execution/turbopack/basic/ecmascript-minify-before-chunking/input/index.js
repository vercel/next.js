import { result } from './main'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('keeps the behavior of code minified before chunking', () => {
  expect(result).toBe(42)
})

it('minifies each module on its own', () => {
  const helper = moduleCode('helper.js')
  expect(helper).toMatch(/return 2\*\w+/)
  expect(helper).not.toContain('doubled')
  const main = moduleCode('main.js')
  expect(main).not.toContain('unusedInEntry')
  expect(main).not.toContain('neverRead')
})
