import { a0 } from 'lib'
import { hasModuleFactory } from '../../../__helpers__/module-factories.js'

it('imports a renamed reexport of a side-effect-free facade', () => {
  expect(a0).toBe('a')
})

it('skips the side-effect-free facade module', () => {
  expect(hasModuleFactory('node_modules/lib/a.js')).toBe(true)
  expect(hasModuleFactory('node_modules/lib/index.js')).toBe(false)
  expect(hasModuleFactory('node_modules/lib/b.js')).toBe(false)
})
