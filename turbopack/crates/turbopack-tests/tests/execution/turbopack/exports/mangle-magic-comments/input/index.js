it('should preserve names for a module imported with webpackExports', async () => {
  const { usedName, exportsInfo } = await import(
    /* webpackExports: ["usedName", "exportsInfo"] */ './lazy'
  )
  expect(usedName).toBe('used')
  // The comment narrows which exports are used, but the promise still exposes a namespace
  // object with the original names. Without a facade, the target cannot mangle those keys.
  expect(exportsInfo.usedName.canMangle).toBe(false)
  expect(exportsInfo.usedName.mangledName).toBeNull()
})

it('should preserve names for a module imported with turbopackExports', async () => {
  const ns = await import(
    /* turbopackExports: ["otherUsedName", "exportsInfo"] */ './lazy'
  )
  expect(ns.otherUsedName).toBe('other-used')
  expect(ns.exportsInfo.otherUsedName.canMangle).toBe(false)
})

it('should keep a plain dynamic import working', async () => {
  const ns = await import('./lazy')
  expect(ns.usedName).toBe('used')
  // The unsplit namespace object still exposes the original names.
  expect(Object.keys(ns)).toContain('usedName')
})
