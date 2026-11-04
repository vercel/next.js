// Exercise the execution harness's default-on materialized namespace option.
import { ENUM_A, exportsInfo } from './enums'
import { getEnums } from './provider'

it('materializes the public namespace while mangling local export keys', async () => {
  const staticNamespace = getEnums()
  const dynamicNamespace = await import('./enums')
  const moduleName =
    'exports/mangle-materialized-namespace-opt-in/input/enums.js [test] (ecmascript)'
  const parts = Array.from(__turbopack_modules__.keys())
    .filter((id) => id.includes(moduleName))
    .map((id) => id.slice(id.indexOf(moduleName)))
    .sort()

  expect(parts).toEqual([moduleName, `${moduleName} <locals>`])
  expect(dynamicNamespace).toBe(staticNamespace)
  expect(dynamicNamespace.ENUM_A).toBe(ENUM_A)
  expect(dynamicNamespace.exportsInfo).toBe(exportsInfo)
  expect(Object.keys(dynamicNamespace).sort()).toEqual([
    'ENUM_A',
    'ENUM_B',
    'default',
    'exportsInfo',
  ])
  expect(exportsInfo.ENUM_A.canMangle).toBe(true)
  expect(exportsInfo.ENUM_A.mangledName).not.toBe('ENUM_A')
  expect(exportsInfo.ENUM_B.mangledName).not.toBe(
    exportsInfo.ENUM_A.mangledName
  )
})
