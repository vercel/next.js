// A local-only module should keep one identity when its namespace escapes: splitting it merely
// for export mangling makes a dynamic import target a facade while named imports use locals.
// The public namespace must still expose the original export names.

import { ENUM_A, exportsInfo } from './enums'
import { getEnums } from './provider'

it('should preserve an escaped namespace without mangling its local exports', () => {
  const ns = getEnums()
  // The namespace object keeps the original names...
  expect(ns.ENUM_A).toBe('a-value')
  expect(ns.ENUM_B).toBe('b-value')
  expect(ns.default).toBe('default-value')
  expect(Object.keys(ns).sort()).toEqual([
    'ENUM_A',
    'ENUM_B',
    'default',
    'exportsInfo',
  ])

  // A named import and the namespace refer to the same local value. The namespace escape
  // prevents the unsplit module's export keys from being mangled.
  expect(ENUM_A).toBe(ns.ENUM_A)
  expect(exportsInfo).toBe(ns.exportsInfo)
  expect(exportsInfo.ENUM_A.canMangle).toBe(false)
  expect(exportsInfo.ENUM_A.mangledName).toBeNull()
  expect(exportsInfo.ENUM_B.canMangle).toBe(false)
})

it('should keep dynamic and static imports of local exports consistent', async () => {
  const dynamic = await import('./enums')
  // The dynamic import and named import must not create facade and locals IDs for this file.
  const moduleName =
    'exports/mangle-materialized-namespace/input/enums.js [test] (ecmascript)'
  expect(
    Array.from(__turbopack_modules__.keys()).filter((id) =>
      id.includes(moduleName)
    )
  ).toEqual([expect.stringContaining(moduleName)])
  expect(dynamic.ENUM_A).toBe(ENUM_A)
  expect(dynamic.exportsInfo).toBe(exportsInfo)
  expect(Object.keys(dynamic).sort()).toEqual([
    'ENUM_A',
    'ENUM_B',
    'default',
    'exportsInfo',
  ])
  expect(dynamic.exportsInfo.ENUM_A.canMangle).toBe(false)
})
