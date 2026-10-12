// Rewritten to assert the observable `__esModule` interop exports rather than
// object identity between `import()` and `require()`: turbopack's `import()`
// yields an exotic Module namespace object, never the same (or deep-equal) plain
// object that `require()` returns.
it('should allow to create namespace exports via __esModule on exports', async () => {
  const ns = await import('./namespace-via-exports')
  expect(ns.abc).toBe('abc')
  expect(ns.default).toBe('default')
})
it('should allow to create namespace exports via __esModule on literal', async () => {
  const ns = await import('./namespace-via-literal')
  expect(ns.abc).toBe('abc')
  expect(ns.default).toBe('default')
})
it('should allow to create namespace exports via __esModule with Object.defineProperty', async () => {
  const ns = await import('./namespace-via-define-property')
  expect(ns.abc).toBe('abc')
  expect(ns.default).toBe('default')
})
it('should allow to create namespace exports via __esModule with Object.defineProperty minimized true', async () => {
  const ns = await import('./namespace-via-define-property-minimized')
  expect(ns.abc).toBe('abc')
  expect(ns.default).toBe('default')
})
it('should allow to create namespace exports via __esModule with Object.defineProperties', async () => {
  const ns = await import('./namespace-via-define-properties')
  expect(ns.abc).toBe('abc')
  expect(ns.default).toBe('default')
})
