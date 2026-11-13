import { y } from './lib.js'
import { bundledCode } from '../../../__helpers__/module-factories.js'

it('keeps a used renamed reexport and drops an unused reexport', () => {
  expect(y).toBe('X_USED_MARKER')

  // Built dynamically so this test file itself doesn't contain the marker.
  expect(bundledCode()).not.toContain(['Z', 'UNUSED', 'MARKER'].join('_'))
})
