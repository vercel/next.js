// Test re-export chains work correctly with mangling
// Each module should independently mangle its export keys
// The wiring between modules should use correct mangled names

import {
  finalExportName,
  finalFunctionName,
  localInC,
  finalDefaultExport,
} from './c'
import defaultFromC from './c'

it('should handle re-export chain with mangling', () => {
  // Values should flow through the chain correctly
  expect(finalExportName).toBe('from-a')
  expect(finalFunctionName()).toBe('func-a')
  expect(localInC).toBe('local-c')
})

it('should handle default exports through re-export chain', () => {
  // Default export from a.js, re-exported through b.js and c.js
  expect(finalDefaultExport()).toBe('default-from-a')
  // Direct default export from c.js
  expect(defaultFromC()).toBe('default-from-c')
})

// Also test direct imports from middle of chain
import { renamedInMiddleLayer, middleLayerFunction } from './b'

it('should handle imports from middle of chain', () => {
  expect(renamedInMiddleLayer).toBe('from-a')
  expect(middleLayerFunction()).toBe('func-a')
})

// Also test direct imports from source with __webpack_exports_info__
import {
  veryLongOriginalExportName,
  anotherLongFunctionName,
  exportsInfo,
} from './a'

it('should handle imports from source', () => {
  expect(veryLongOriginalExportName).toBe('from-a')
  expect(anotherLongFunctionName()).toBe('func-a')
})

it('should have exports info in source module (via __webpack_exports_info__)', () => {
  // When mangling is enabled, all ESM modules are split into locals+facade
  // so exports have mangled names
  console.log('exportsInfo from a.js:', JSON.stringify(exportsInfo, null, 2))

  // Verify the structure
  expect(exportsInfo).toBeDefined()
  expect(exportsInfo.veryLongOriginalExportName).toBeDefined()
  expect(exportsInfo.anotherLongFunctionName).toBeDefined()

  // Exports should be marked as used and have mangled names
  expect(exportsInfo.veryLongOriginalExportName.used).toBe(true)
  expect(exportsInfo.veryLongOriginalExportName.mangledName).toBeDefined()
  expect(exportsInfo.anotherLongFunctionName.used).toBe(true)
  expect(exportsInfo.anotherLongFunctionName.mangledName).toBeDefined()
})
