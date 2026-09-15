import { readNamed, readOther, exportsInfo, keys } from './cjs-consumer'
import { someLongExportName } from './esm'

it('should keep a CommonJS consumer of an ESM module working', () => {
  expect(readNamed()).toBe('esm-1')
  expect(readOther()).toBe('esm-2')
  // The ESM import of the same module resolves to the same binding.
  expect(someLongExportName).toBe('esm-1')
})

it('should not mangle a module that a CommonJS module requires', () => {
  // The `esm.someLongExportName` accesses in `cjs-consumer.js` are user source, so the names have
  // to stay as written.
  expect(exportsInfo.someLongExportName.canMangle).toBe(false)
  expect(keys()).toContain('someLongExportName')
})
