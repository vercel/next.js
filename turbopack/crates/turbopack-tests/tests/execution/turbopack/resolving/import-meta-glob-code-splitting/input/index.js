// Lazy matches are loaded on demand, so each one is split into its own async chunk.
const lazy = import.meta.glob('./lazy/*.js')

// Eager matches are evaluated synchronously, so they stay in the entry chunk.
const eager = import.meta.glob('./eager/*.js', { eager: true })

// Whether the module itself (not just its async loader, which ships in the
// importing chunk) has been registered in the module factory map.
function isLoaded(file) {
  return Array.from(__turbopack_modules__.keys()).some((id) =>
    id.endsWith(`/input/${file} [test] (ecmascript)`)
  )
}

it('should include eager matches in the entry chunk', () => {
  // Available without loading a chunk. Scope hoisting may merge the match into the
  // glob's synthetic module, so it isn't necessarily registered on its own.
  expect(eager['./eager/c.js'].default).toBe('eager c')
})

it('should load each lazy match in its own chunk when its thunk is called', async () => {
  expect(Object.keys(lazy).sort()).toEqual(['./lazy/a.js', './lazy/b.js'])

  // Nothing from the lazy glob is loaded until a thunk is called.
  expect(isLoaded('lazy/a.js')).toBe(false)
  expect(isLoaded('lazy/b.js')).toBe(false)

  const a = await lazy['./lazy/a.js']()
  expect(a.default).toBe('lazy a')

  // Loading one match does not pull in the others.
  expect(isLoaded('lazy/a.js')).toBe(true)
  expect(isLoaded('lazy/b.js')).toBe(false)

  const b = await lazy['./lazy/b.js']()
  expect(b.default).toBe('lazy b')
  expect(isLoaded('lazy/b.js')).toBe(true)
})
