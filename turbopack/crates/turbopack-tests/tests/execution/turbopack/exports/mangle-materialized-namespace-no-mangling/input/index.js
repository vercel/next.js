import { veryLongExportName, exportsInfo } from './enums'

it('does not split when only materialized mangling is enabled', async () => {
  const dynamic = await import('./enums')
  const moduleName =
    'exports/mangle-materialized-namespace-no-mangling/input/enums.js [test] (ecmascript)'
  const parts = Array.from(__turbopack_modules__.keys())
    .filter((id) => id.includes(moduleName))
    .map((id) => id.slice(id.indexOf(moduleName)))

  expect(parts).toEqual([moduleName])
  expect(dynamic.veryLongExportName).toBe(veryLongExportName)
  expect(dynamic.exportsInfo).toBe(exportsInfo)
  expect(exportsInfo.canMangle).toBe(false)
})
