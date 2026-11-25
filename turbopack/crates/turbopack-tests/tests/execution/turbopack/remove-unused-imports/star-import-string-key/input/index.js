import * as lit from './lit.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('narrows a namespace import accessed with a string-literal key', () => {
  expect(lit['foo']()).toBe('foo-value')

  // A string-literal key narrows to `foo`, so `unused` leaves the bundle.
  const code = moduleCode('lit.js')
  expect(code).toContain('foo-value')
  expect(code).not.toContain('unused-value')
})
