it('should mark all exports as used with non-destructured dynamic import', async () => {
  const lib = await import('./modules/all')
  expect(lib.cat).toBe('cat')
  expect(lib.exportsInfo.cat.used).toBe(true)
  expect(lib.exportsInfo.dog.used).toBe(true)
})

it('should tree-shake unused exports with const destructured dynamic import', async () => {
  const { cat, exportsInfo } = await import('./modules/const')
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with let destructured dynamic import', async () => {
  let { cat, exportsInfo } = await import('./modules/let')
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with var destructured dynamic import', async () => {
  var { cat, exportsInfo } = await import('./modules/var')
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dog.used).toBe(false)
})

it('should tree-shake all exports with empty destructured dynamic import', async () => {
  const { exportsInfo } = await import('./modules/empty')
  expect(exportsInfo.cat.used).toBe(false)
  expect(exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with renamed destructured dynamic import', async () => {
  const { cat: myCat, exportsInfo } = await import('./modules/rename')
  expect(myCat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with nested destructured dynamic import', async () => {
  const {
    dog: { name },
    exportsInfo,
  } = await import('./modules/nested')
  expect(name).toBe('dog')
  expect(exportsInfo.dog.used).toBe(true)
  expect(exportsInfo.cat.used).toBe(false)
})

it('should tree-shake unused exports with member access on dynamic import', async () => {
  const cat = (await import('./modules/member')).cat
  const { exportsInfo } = await import('./modules/member')
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with .then() arrow destructured dynamic import', async () => {
  const result = await new Promise((resolve) => {
    import('./modules/then-arrow').then(({ cat, exportsInfo }) => {
      resolve({ cat, exportsInfo })
    })
  })
  expect(result.cat).toBe('cat')
  expect(result.exportsInfo.cat.used).toBe(true)
  expect(result.exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with .then() function destructured dynamic import', async () => {
  const result = await new Promise((resolve) => {
    import('./modules/then-fn').then(function ({
      cat,
      default: def,
      exportsInfo,
    }) {
      resolve({ cat, def, exportsInfo })
    })
  })
  expect(result.cat).toBe('cat')
  expect(result.def).toBe('the default value')
  expect(result.exportsInfo.cat.used).toBe(true)
  expect(result.exportsInfo.default.used).toBe(true)
  expect(result.exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with default destructured dynamic import', async () => {
  const { default: defaultValue, exportsInfo } = await import(
    './modules/default'
  )
  expect(defaultValue).toBe('the default value')
  expect(exportsInfo.default.used).toBe(true)
  expect(exportsInfo.cat.used).toBe(false)
  expect(exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with turbopackExports comment', async () => {
  const { cat, exportsInfo } = await import(
    /* turbopackExports: ["cat", "exportsInfo"] */ './modules/turbopack'
  )
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dog.used).toBe(false)
})

it('should tree-shake unused exports with webpackExports comment', async () => {
  const { cat, exportsInfo } = await import(
    /* webpackExports: ["cat", "exportsInfo"] */ './modules/webpack'
  )
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dog.used).toBe(false)
})
