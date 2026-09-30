import { readNamed, readOther, exportsInfo, keys } from './cjs-consumer'
import { someLongExportName } from './esm'

it('should keep a CommonJS consumer of an ESM module working', () => {
  expect(readNamed()).toBe('esm-1')
  expect(readOther()).toBe('esm-2')
  // The ESM import of the same module resolves to the same binding.
  expect(someLongExportName).toBe('esm-1')
})

it('should keep a CommonJS consumer working with original export names', () => {
  // The `esm.someLongExportName` accesses in `cjs-consumer.js` are user source, so the unsplit
  // module must keep the original keys on its namespace object.
  expect(exportsInfo.someLongExportName.canMangle).toBe(false)
  expect(keys()).toContain('someLongExportName')
})
