it('should mangle a module imported with webpackExports', async () => {
  const { usedName, exportsInfo } = await import(
    /* webpackExports: ["usedName", "exportsInfo"] */ './lazy'
  )
  expect(usedName).toBe('used')
  // The magic comment narrows which exports are used. The module is still mangled internally —
  // the namespace object the `import()` resolves to is materialized by the facade under the
  // original names, forwarding to the mangled keys.
  expect(exportsInfo.usedName.canMangle).toBe(true)
  expect(exportsInfo.usedName.mangledName).toEqual(expect.any(String))
  expect(exportsInfo.usedName.mangledName).not.toBe('usedName')
})

it('should mangle a module imported with turbopackExports', async () => {
  const ns = await import(
    /* turbopackExports: ["otherUsedName", "exportsInfo"] */ './lazy'
  )
  expect(ns.otherUsedName).toBe('other-used')
  expect(ns.exportsInfo.otherUsedName.canMangle).toBe(true)
})

it('should keep a plain dynamic import working', async () => {
  const ns = await import('./lazy')
  expect(ns.usedName).toBe('used')
  // The materialized namespace object still exposes the original names.
  expect(Object.keys(ns)).toContain('usedName')
})
