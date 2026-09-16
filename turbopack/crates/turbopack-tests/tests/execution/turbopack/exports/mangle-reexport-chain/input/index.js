import {
  finalExportName,
  finalFunctionName,
  finalDefaultExport,
  localInC,
  exportsInfo,
} from './c'
import defaultFromC from './c'
import { renamedInMiddleLayer, middleLayerFunction } from './b'
import { veryLongOriginalExportName, anotherLongFunctionName } from './a'

it('should carry values through a re-export chain', () => {
  // Each module in the chain mangles its own keys independently; every hop has to resolve to the
  // key of the module that actually produces the binding.
  expect(finalExportName).toBe('from-a')
  expect(finalFunctionName()).toBe('func-a')
  expect(localInC).toBe('local-c')
})

it('should carry default exports through a re-export chain', () => {
  expect(finalDefaultExport()).toBe('default-from-a')
  expect(defaultFromC()).toBe('default-from-c')
})

it('should support importing from the middle and the source of the chain', () => {
  expect(renamedInMiddleLayer).toBe('from-a')
  expect(middleLayerFunction()).toBe('func-a')
  expect(veryLongOriginalExportName).toBe('from-a')
  expect(anotherLongFunctionName()).toBe('func-a')
})

it('should mangle the source module of the chain', () => {
  expect(exportsInfo.veryLongOriginalExportName.canMangle).toBe(true)
  expect(exportsInfo.veryLongOriginalExportName.mangledName).not.toBe(
    'veryLongOriginalExportName'
  )
  expect(exportsInfo.anotherLongFunctionName.mangledName).not.toBe(
    exportsInfo.veryLongOriginalExportName.mangledName
  )
})
