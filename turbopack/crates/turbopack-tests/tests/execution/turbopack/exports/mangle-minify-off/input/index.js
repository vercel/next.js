// `mangleExportNames` is on, but minification is off. Mangled export keys in readable output
// would only make it harder to read, so nothing is renamed — the same reason `--no-mangling`
// turns export mangling off.

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

it('should not mangle anything with minification disabled', () => {
  expect(exportsInfo.a.canMangle).toBe(false)
  expect(exportsInfo.a.mangledName).toBe(null)
  expect(exportsInfo.reallyLongExportName.canMangle).toBe(false)
  expect(exportsInfo.reallyLongExportName.mangledName).toBe(null)
})
