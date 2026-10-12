// When require.context is called without an explicit filter regex,
// the default /^\.\/.*$/ should be used (matches any file).
it('require.context() uses the default filter when none is provided', () => {
  const ctx = require.context('./deps', true)
  expect(ctx.keys().sort()).toEqual(['./bar.js', './foo.js'])
  expect(
    ctx
      .keys()
      .map((k) => ctx(k).value)
      .sort()
  ).toEqual(['bar', 'foo'])
})
