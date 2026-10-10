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

it('should keep the values of mangled exports correct', () => {
  expect(a).toBe('short-a')
  expect(b).toBe('short-b')
  expect(foo).toBe('short-foo')
  expect(reallyLongExportName).toBe('long-name-1')
  expect(anotherVeryLongExportName).toBe('long-name-2')
  expect(shortFn()).toBe('short-fn')
  expect(thisIsAVeryLongFunctionName()).toBe('long-fn')
})

it('should actually mangle the exported names', () => {
  // `__webpack_exports_info__` is keyed by the original names and reports the key the export is
  // emitted under, which is how a running test can observe that mangling happened at all.
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
  // Distinct exports never share a key.
  expect(exportsInfo.reallyLongExportName.mangledName).not.toBe(
    exportsInfo.thisIsAVeryLongFunctionName.mangledName
  )
})

it('should keep a name that is already short', () => {
  // `a` is already a valid one-character identifier, so it reserves that bucket and keeps itself
  // instead of being renamed.
  expect(exportsInfo.a.mangledName).toBe('a')
})
