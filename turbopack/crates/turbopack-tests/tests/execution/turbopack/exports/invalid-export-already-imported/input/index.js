// The "Export ... doesn't exist in target module" issues (see `issues/`) must
// not suggest exports that the same import declaration already imports.
function expectInvalidExport(load) {
  // Either requiring should throw, or the missing export is undefined
  let ns
  try {
    ns = load()
  } catch {
    return
  }
  expect(ns.default).toContain(undefined)
}

it('should report invalid exports', () => {
  expectInvalidExport(() => require('./same-declaration'))
  expectInvalidExport(() => require('./aliased'))
  expectInvalidExport(() => require('./separate-declaration'))
  expectInvalidExport(() => require('./all-imported'))
})
