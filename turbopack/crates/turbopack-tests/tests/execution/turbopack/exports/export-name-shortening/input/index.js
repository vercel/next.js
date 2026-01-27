// Test export name shortening behavior
//
// Key behavior:
// 1. Named imports - internal names may be shortened, but values are correct
// 2. Namespace import - ALL names must be preserved for Object.keys to work

import {
  a,
  b,
  foo,
  reallyLongExportName,
  anotherVeryLongExportName,
  shortFn,
  thisIsAVeryLongFunctionName,
} from './named-exports'

import * as namespaceModule from './namespace-exports'

it('should work with named imports (values are correct)', () => {
  // Values should be correct regardless of internal name mangling
  expect(a).toBe('short-a')
  expect(b).toBe('short-b')
  expect(foo).toBe('short-foo')
  expect(reallyLongExportName).toBe('long-name-1')
  expect(anotherVeryLongExportName).toBe('long-name-2')
  expect(shortFn()).toBe('short-fn')
  expect(thisIsAVeryLongFunctionName()).toBe('long-fn')
})

it('should preserve namespace export names (import *)', () => {
  // With namespace import, Object.keys must return original names
  // This verifies that namespace-accessed modules don't get mangled
  const keys = Object.keys(namespaceModule).sort()
  expect(keys).toEqual([
    'anotherLongNamespacedExport',
    'namespaceVeryLongFunctionName',
    'nsShortFn',
    'veryLongNamespacedExport',
    'x',
    'y',
    'z',
  ])

  // Values should work correctly via namespace access
  expect(namespaceModule.x).toBe('ns-x')
  expect(namespaceModule.y).toBe('ns-y')
  expect(namespaceModule.z).toBe('ns-z')
  expect(namespaceModule.veryLongNamespacedExport).toBe('ns-long-1')
  expect(namespaceModule.anotherLongNamespacedExport).toBe('ns-long-2')
  expect(namespaceModule.nsShortFn()).toBe('ns-short-fn')
  expect(namespaceModule.namespaceVeryLongFunctionName()).toBe('ns-long-fn')
})
