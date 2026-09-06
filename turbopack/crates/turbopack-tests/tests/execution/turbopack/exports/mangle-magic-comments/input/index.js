it('should keep the names of a module imported with webpackExports', async () => {
  const { usedName, exportsInfo } = await import(
    /* webpackExports: ["usedName", "exportsInfo"] */ './lazy'
  )
  expect(usedName).toBe('used')
  // The magic comment narrows which exports are *used*, but the namespace object still exposes
  // them under their original names, so the module has to back off.
  expect(exportsInfo.usedName.canMangle).toBe(false)
  expect(exportsInfo.usedName.mangledName).toBe(null)
})

it('should keep the names of a module imported with turbopackExports', async () => {
  const ns = await import(
    /* turbopackExports: ["otherUsedName", "exportsInfo"] */ './lazy'
  )
  expect(ns.otherUsedName).toBe('other-used')
  expect(ns.exportsInfo.otherUsedName.canMangle).toBe(false)
})

it('should keep a plain dynamic import working', async () => {
  const ns = await import('./lazy')
  expect(ns.usedName).toBe('used')
  expect(Object.keys(ns)).toContain('usedName')
})
