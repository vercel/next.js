import { Used } from './a.ts'

/*
 * `mangleExportNames` is turned off for this fixture in options.json.
 *
 * This test is about `/*#__PURE__*\/` retention, and it finds the module factory
 * to inspect by matching on an ident suffix (`... (ecmascript)` below). Mangling
 * splits a module with exports into a facade plus a `<locals>` module, which
 * changes that ident and makes the lookup miss. Nothing about the behaviour
 * under test involves export names, so the fixture opts out rather than
 * hard-coding whichever ident the split happens to produce.
 */

it('should retain PURE comments with scope hoisting', () => {
  expect(Used.THIS_IS_USED).toBe(0)

  let factory = __turbopack_modules__.get(
    [...__turbopack_modules__.keys()].find((m) =>
      m.endsWith('scope-hoisting/pure-comments/input/a.ts [test] (ecmascript)')
    )
  )

  const source = factory.toString()
  expect(source).not.toContain('THIS_SHOULD_BE_REMOVED')
  expect(source).toContain('THIS_IS_USED')
})
