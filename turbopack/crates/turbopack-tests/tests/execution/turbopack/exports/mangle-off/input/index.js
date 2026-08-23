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

it('should not add anything to __webpack_exports_info__ when disabled', () => {
  // With the option off, the shape of `__webpack_exports_info__` is exactly what it was before
  // export mangling existed: no `canMangle`, no `mangledName`.
  expect(exportsInfo.a.used).toBe(true)
  expect('canMangle' in exportsInfo.a).toBe(false)
  expect('mangledName' in exportsInfo.a).toBe(false)
  expect('canMangle' in exportsInfo.reallyLongExportName).toBe(false)
})
