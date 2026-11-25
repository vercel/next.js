// The control for `mangle-basic`: identical input, `mangleExportNames` off. Same observable
// behaviour, and no export key is renamed.

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

it('should keep the values correct with mangling disabled', () => {
  expect(a).toBe('short-a')
  expect(b).toBe('short-b')
  expect(foo).toBe('short-foo')
  expect(reallyLongExportName).toBe('long-name-1')
  expect(anotherVeryLongExportName).toBe('long-name-2')
  expect(shortFn()).toBe('short-fn')
  expect(thisIsAVeryLongFunctionName()).toBe('long-fn')
})

it('should report canMangle: false and mangledName: null when disabled', () => {
  // With the option off, `canMangle`/`mangledName` are still present (the shape of
  // `__webpack_exports_info__` no longer depends on whether mangling is enabled at all), but
  // report that nothing was mangled: `canMangle` is always false, and `mangledName` is only ever
  // a string when `canMangle` is true, so it's `null` here.
  expect(exportsInfo.a.used).toBe(true)
  expect(exportsInfo.a.canMangle).toBe(false)
  expect(exportsInfo.a.mangledName).toBe(null)
  expect(exportsInfo.reallyLongExportName.canMangle).toBe(false)
  expect(exportsInfo.reallyLongExportName.mangledName).toBe(null)
})
