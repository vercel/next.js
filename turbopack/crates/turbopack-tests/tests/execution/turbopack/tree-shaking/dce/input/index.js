import { baz } from './module'
import {
  bundledCode,
  hasModuleFactory,
} from '../../../__helpers__/module-factories.js'

if (1 + 1 == 3) {
  baz()
}

it('removes a module only used in dead code', () => {
  expect(hasModuleFactory('module.js')).toBe(false)

  // Built dynamically so this test file itself doesn't contain the marker.
  expect(bundledCode()).not.toContain(
    ['should', 'not', 'be', 'included'].join(' ')
  )
})
