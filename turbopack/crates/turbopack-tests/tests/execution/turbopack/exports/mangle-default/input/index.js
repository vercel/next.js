import theDefault, { someLongExportName, exportsInfo } from './lib'
import throughReexport, { renamedDefault } from './reexport'
import {
  __esModule as esModuleExport,
  exportsInfo as esModuleExportsInfo,
} from './es-module-name'

it('should keep the default export working when it is mangled', () => {
  expect(theDefault()).toBe('default-value')
  expect(someLongExportName).toBe('named-value')
})

it('should mangle the default export key', () => {
  expect(exportsInfo.default.canMangle).toBe(true)
  expect(exportsInfo.default.mangledName).not.toBe('default')
  expect(exportsInfo.default.mangledName.length).toBeLessThanOrEqual(2)
  // `default` shares the table with the other exports, so it never collides with them.
  expect(exportsInfo.default.mangledName).not.toBe(
    exportsInfo.someLongExportName.mangledName
  )
})

it('should carry a mangled default through a re-export', () => {
  expect(throughReexport()).toBe('default-value')
  expect(renamedDefault()).toBe('default-value')
})

it('should mangle an export literally named __esModule', () => {
  // The name is only an interop marker when a CommonJS module sets it; as an ESM export name it
  // carries no meaning, so its key is shortened like any other.
  expect(esModuleExport).toBe('a-normal-export')
  expect(esModuleExportsInfo.__esModule.canMangle).toBe(true)
  expect(esModuleExportsInfo.__esModule.mangledName).not.toBe('__esModule')
})
