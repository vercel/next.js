it('should preserve names for a module imported with webpackExports', async () => {
  const { usedName, exportsInfo } = await import(
    /* webpackExports: ["usedName", "exportsInfo"] */ './lazy'
  )
  expect(usedName).toBe('used')
  // The comment narrows which exports are used, but the promise still exposes the public
  // namespace with original names. The backing module may mangle its local keys.
  expect(exportsInfo.usedName.canMangle).toBe(true)
  expect(exportsInfo.usedName.mangledName).not.toBe('usedName')
})

it('should preserve names for a module imported with turbopackExports', async () => {
  const ns = await import(
    /* turbopackExports: ["otherUsedName", "exportsInfo"] */ './lazy'
  )
  expect(ns.otherUsedName).toBe('other-used')
  expect(ns.exportsInfo.otherUsedName.canMangle).toBe(true)
  expect(ns.exportsInfo.otherUsedName.mangledName).not.toBe('otherUsedName')
})

it('should keep a plain dynamic import working', async () => {
  const ns = await import('./lazy')
  expect(ns.usedName).toBe('used')
  // The public namespace still exposes the original names.
  expect(Object.keys(ns)).toContain('usedName')
})
