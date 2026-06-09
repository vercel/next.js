// These calls trigger compile-time errors (verified via issue snapshots).
// They are wrapped in functions to avoid runtime evaluation errors, since
// invalid glob calls are not transformed and would throw at runtime.

function getTooMany() {
  return import.meta.glob('./dir/*.js', {}, {})
}

function getNumPattern() {
  return import.meta.glob(123)
}

function getNonObjOptions() {
  return import.meta.glob('./dir/*.js', 'eager')
}

it('should emit errors for invalid glob calls', () => {
  // The compile-time errors are the main verification (issue snapshots).
  // At runtime, these untransformed calls would throw.
  expect(() => getTooMany()).toThrow()
  expect(() => getNumPattern()).toThrow()
  expect(() => getNonObjOptions()).toThrow()
})
