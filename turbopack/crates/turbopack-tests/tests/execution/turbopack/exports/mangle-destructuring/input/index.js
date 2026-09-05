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

it('should mangle a module read through a namespace binding', () => {
  // A namespace-imported module is still mangled internally. The facade keeps the original names
  // for whoever reads the namespace object, and forwards them to the mangled keys of the locals
  // module — so the reads above (member access, destructuring, `default`) all stay correct while
  // the emitted keys get shorter.
  expect(mod.exportsInfo.aVeryLongExportName.canMangle).toBe(true)
  expect(mod.exportsInfo.aVeryLongExportName.mangledName).toEqual(
    expect.any(String)
  )
  expect(
    mod.exportsInfo.aVeryLongExportName.mangledName.length
  ).toBeLessThanOrEqual(2)
})
