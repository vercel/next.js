import { readNamed, readOther, exportsInfo, keys } from './cjs-consumer'
import { someLongExportName } from './esm'

it('should keep a CommonJS consumer of an ESM module working', () => {
  expect(readNamed()).toBe('esm-1')
  expect(readOther()).toBe('esm-2')
  // The ESM import of the same module resolves to the same binding.
  expect(someLongExportName).toBe('esm-1')
})

it('should keep a CommonJS consumer working with original export names', () => {
  // The public facade keeps the original names for user-source `esm.someLongExportName` reads,
  // even though the backing module can mangle its local export keys.
  expect(exportsInfo.someLongExportName.canMangle).toBe(true)
  expect(exportsInfo.someLongExportName.mangledName).not.toBe(
    'someLongExportName'
  )
  expect(keys()).toContain('someLongExportName')
})
