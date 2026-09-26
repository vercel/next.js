import * as mod from './module'

it('should keep values correct when destructuring the namespace', () => {
  const { aVeryLongExportName, anotherVeryLongExportName } = mod
  expect(aVeryLongExportName).toBe('a-value')
  expect(anotherVeryLongExportName).toBe('b-value')
})

it('should keep values correct when destructuring a namespace property', () => {
  const { a, b } = mod.objectValuedExportName
  expect(a).toBe('a')
  expect(b).toBe('b')
})

it('should keep values correct with member access on the namespace', () => {
  expect(mod.aVeryLongExportName).toBe('a-value')
})

it('should handle `default` when destructuring a namespace', () => {
  const { default: value } = mod
  expect(value).toBe('default-value')
})

it('should preserve original names when a namespace binding escapes', () => {
  // Without a facade split, the module keeps its public keys because callers can read the
  // namespace object by its original export names.
  expect(mod.exportsInfo.aVeryLongExportName.canMangle).toBe(false)
  expect(mod.exportsInfo.aVeryLongExportName.mangledName).toBeNull()
})
