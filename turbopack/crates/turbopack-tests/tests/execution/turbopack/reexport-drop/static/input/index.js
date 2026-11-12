import { used } from './lib.js'
import { bundledCode } from '../../../__helpers__/module-factories.js'

it('drops an unused reexport of a statically imported module', () => {
  expect(used).toBe('USED')

  // Built dynamically so this test file itself doesn't contain the marker.
  expect(bundledCode()).not.toContain(['UNUSED', 'MARKER'].join('_'))
})
