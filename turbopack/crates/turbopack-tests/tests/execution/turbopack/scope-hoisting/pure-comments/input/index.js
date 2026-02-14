import './a.ts'

it('should retain PURE comments with scope hoisting', () => {
  let factory = __turbopack_modules__.get(
    [...__turbopack_modules__.keys()].find((m) =>
      m.endsWith(
        'scope-hoisting/pure-comments/input/index.js [test] (ecmascript)'
      )
    )
  )

  const source = factory.toString()
  const marker = 'THIS_SHOULD_BE_REMOVED'
  const markerOccurrences = source.split(marker).length - 1

  expect(markerOccurrences).toBe(1)
})
