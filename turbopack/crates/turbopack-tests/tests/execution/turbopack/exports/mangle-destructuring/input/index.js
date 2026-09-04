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

it('should back off for a module read through a namespace binding', () => {
  // Reads through an `import * as ns` binding are reported as a *partial namespace object*: we
  // know which names are used, but not whether every read was lowered to a direct named access,
  // and a read that wasn't (a destructuring pattern, say) still uses the original name. So the
  // module keeps its names. Distinguishing lowered reads from a materialized namespace object is
  // a follow-up; it would unlock mangling for namespace-imported modules too.
  expect(mod.exportsInfo.aVeryLongExportName.canMangle).toBe(false)
  expect(mod.exportsInfo.aVeryLongExportName.mangledName).toBe(null)
})
