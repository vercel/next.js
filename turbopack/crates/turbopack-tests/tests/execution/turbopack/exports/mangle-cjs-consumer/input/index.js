import { readNamed, readOther, exportsInfo, keys } from './cjs-consumer'
import { someLongExportName } from './esm'

it('should keep a CommonJS consumer of an ESM module working', () => {
  expect(readNamed()).toBe('esm-1')
  expect(readOther()).toBe('esm-2')
  // The ESM import of the same module resolves to the same binding.
  expect(someLongExportName).toBe('esm-1')
})

it('should keep a CommonJS consumer working against a mangled module', () => {
  // The `esm.someLongExportName` accesses in `cjs-consumer.js` are user source, so what the
  // CommonJS module receives has to keep carrying the original names. It does: the facade
  // materializes them, forwarding to the mangled keys of the locals module underneath.
  expect(exportsInfo.someLongExportName.canMangle).toBe(true)
  expect(keys()).toContain('someLongExportName')
})
