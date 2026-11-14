import { result } from './main'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('keeps the behavior of code minified per item and per chunk', () => {
  expect(result).toBe(42)
})

it('minifies each module before the chunk is minified', () => {
  const helper = moduleCode('helper.js')
  expect(helper).not.toContain('doubled')
  expect(helper).not.toContain('unusedExport')
  const main = moduleCode('main.js')
  expect(main).not.toContain('unusedInEntry')
  expect(main).not.toContain('neverRead')
})
