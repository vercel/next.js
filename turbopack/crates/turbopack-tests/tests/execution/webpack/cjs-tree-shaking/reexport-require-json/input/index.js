import { data as fromConst } from './reexport-const'
import { data as fromSpecifier } from './reexport-specifier'
import { data as fromImport } from './reexport-import'

const expected = { a: 1, b: 2, nested: { x: 3 } }

it('should keep the whole JSON when `export const data = require(json)` (#21135)', () => {
  expect(fromConst).toEqual(expected)
})

it('should keep the whole JSON when a required JSON binding is re-exported (#21135)', () => {
  expect(fromSpecifier).toEqual(expected)
})

it('should keep the whole JSON when an imported JSON default is re-exported', () => {
  expect(fromImport).toEqual(expected)
})
