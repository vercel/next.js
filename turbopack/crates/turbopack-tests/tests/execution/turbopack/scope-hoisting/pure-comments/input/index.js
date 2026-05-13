import { Used } from './a.ts'

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
