import { ownLongExportName, staticallyNamedExport } from './reexport'
import * as ns from './reexport'

it('should keep a re-export of dynamic exports working', () => {
  expect(ownLongExportName).toBe('own-value')
  expect(staticallyNamedExport).toBe('static-value')
})

it('should expose the original names of a module with dynamic re-exports', () => {
  // The star re-export is resolved at runtime by property access on the original names, so the
  // names this module exposes must be the ones written in the source.
  expect(ns.ownLongExportName).toBe('own-value')
  expect(ns.staticallyNamedExport).toBe('static-value')
  expect(ns.dynamicallyNamedExport).toBe('dynamic-value')
  expect(Object.keys(ns)).toContain('ownLongExportName')
})
