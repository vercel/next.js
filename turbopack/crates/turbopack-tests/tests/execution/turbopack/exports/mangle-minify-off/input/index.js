// `mangleExportNames` is on, but minification is off. Mangling and minification are independent
// options — this fixture proves that mangling still happens without minification, the same way it
// would with it (see `mangle-basic`).

import {
  a,
  b,
  foo,
  reallyLongExportName,
  anotherVeryLongExportName,
  shortFn,
  thisIsAVeryLongFunctionName,
  exportsInfo,
} from './named-exports'

it('should keep the values correct with minification disabled', () => {
  expect(a).toBe('short-a')
  expect(b).toBe('short-b')
  expect(foo).toBe('short-foo')
  expect(reallyLongExportName).toBe('long-name-1')
  expect(anotherVeryLongExportName).toBe('long-name-2')
  expect(shortFn()).toBe('short-fn')
  expect(thisIsAVeryLongFunctionName()).toBe('long-fn')
})

it('should still mangle the exported names with minification disabled', () => {
  expect(exportsInfo.reallyLongExportName.canMangle).toBe(true)
  expect(exportsInfo.reallyLongExportName.mangledName).toEqual(
    expect.any(String)
  )
  expect(
    exportsInfo.reallyLongExportName.mangledName.length
  ).toBeLessThanOrEqual(2)
  expect(exportsInfo.thisIsAVeryLongFunctionName.mangledName).not.toBe(
    'thisIsAVeryLongFunctionName'
  )
})
