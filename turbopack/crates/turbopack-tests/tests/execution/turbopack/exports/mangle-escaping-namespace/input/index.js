import { getEnums } from './provider'
import { enumsNs } from './reexport'
import { getCjs } from './cjs-provider'
import { read } from './destr'
import {
  someLongExportName,
  anotherLongExportName,
  exportsInfo,
} from './mangleable'

it('should keep an escaped namespace object readable by its original names', () => {
  const ns = getEnums()
  expect(ns.ENUM_A).toBe('a-value')
  expect(ns.ENUM_B).toBe('b-value')
  expect(ns.ENUM_C).toBe('c-value')
  expect(ns.NUM).toBe(42)
  expect(ns.default).toBe('default-value')
})

it('should expose the original names when enumerating an escaped namespace', () => {
  const keys = Object.keys(getEnums()).sort()
  expect(keys).toEqual(['ENUM_A', 'ENUM_B', 'ENUM_C', 'NUM', 'default'])
})

it('should keep an escaped re-exported (export * as) namespace working', () => {
  const get = () => enumsNs
  const ns = get()
  expect(ns.ENUM_A).toBe('a-value')
  expect(ns.default).toBe('default-value')
})

it('should keep destructuring working for a module that also escapes', () => {
  expect(read()).toBe('b-value')
})

it('should keep `delete ns.member` valid when the namespace escapes', () => {
  // Deleting a member that does not exist returns true per spec, and must not be emitted as a
  // bare `delete undefined`, which is a SyntaxError in strict mode.
  const ns = getEnums()
  expect(delete ns.doesNotExist).toBe(true)
  expect(ns.ENUM_A).toBe('a-value')
})

it('should keep an escaped CommonJS namespace interop correct', () => {
  const ns = getCjs()
  expect(ns.CJS_A).toBe('cjs-a')
  expect(ns.CJS_B).toBe('cjs-b')
})

it('should still mangle a sibling module that does not escape', () => {
  expect(someLongExportName).toBe('mangled-1')
  expect(anotherLongExportName).toBe('mangled-2')
  expect(exportsInfo.someLongExportName.canMangle).toBe(true)
  expect(exportsInfo.someLongExportName.mangledName).not.toBe(
    'someLongExportName'
  )
})
