// PACK-3895: ensure that negative lookaround works.
it('ensure require.context respects filters with look-around assertions', () => {
  let ctx = require.context('./deps', true, /foo(?!_test)/)
  // import all the matches, should just get foo.js
  expect(
    ctx
      .keys()
      .map((k) => Object.values(ctx(k)))
      .flat()
  ).toEqual(['You found me'])
})
