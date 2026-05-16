import { log as booleanValueModuleLog } from 'boolean-value-module/tracker'
import booleanValueModule from 'boolean-value-module'
import { log as globValueModuleLog } from 'glob-value-module/tracker'
import globValueModule from 'glob-value-module'

it('should handle a boolean', function () {
  expect(booleanValueModule).toBe('def')
  expect(booleanValueModuleLog).toEqual(['index.js'])
})

it('should handle globs', function () {
  expect(globValueModule).toBe('def')
  expect(globValueModuleLog).toEqual(['./src/a.js', 'a.js', 'index.js'])
})
