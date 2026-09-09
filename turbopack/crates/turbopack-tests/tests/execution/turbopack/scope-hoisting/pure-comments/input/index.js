import { Used } from './a.ts'

it('should retain PURE comments with scope hoisting', () => {
  expect(Used.THIS_IS_USED).toBe(0)

  // Matched with `includes` rather than `endsWith` so this finds the module whether or not it was
  // split: export mangling splits a module with exports into a facade plus a `<locals>` module, and
  // the code under test here lives in the latter, whose ident carries a ` <locals>` suffix.
  let factory = __turbopack_modules__.get(
    [...__turbopack_modules__.keys()].find((m) =>
      m.includes('scope-hoisting/pure-comments/input/a.ts [test] (ecmascript)')
    )
  )

  const source = factory.toString()
  expect(source).not.toContain('THIS_SHOULD_BE_REMOVED')
  expect(source).toContain('THIS_IS_USED')
})
