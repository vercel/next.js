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

it('keeps contexts over the same directory with different filters apart', () => {
  let tests = require.context('./deps', true, /_test\.js$/)
  let all = require.context('./deps', true, /\.js$/)
  expect(tests.keys()).toEqual(['./foo_test.js'])
  expect(all.keys()).toEqual(['./foo.js', './foo_test.js'])
})

it('resolves a key to the id of its module', () => {
  let ctx = require.context('./deps', false, /foo\.js$/)
  expect(ctx.resolve('./foo.js')).toBe(require.resolve('./deps/foo.js'))
  expect(() => ctx('./missing.js')).toThrow("Cannot find module './missing.js'")
})
