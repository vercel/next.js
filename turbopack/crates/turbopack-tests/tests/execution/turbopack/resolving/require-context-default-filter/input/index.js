// When require.context is called without an explicit filter regex,
// the default /^\.\/.*$/ should be used (matches any file). Like webpack, every
// file can also be requested without its extension.
it('require.context() uses the default filter when none is provided', () => {
  const ctx = require.context('./deps', true)
  expect(ctx.keys()).toEqual(['./bar', './bar.js', './foo', './foo.js'])
  expect(
    ctx
      .keys()
      .map((k) => ctx(k).value)
      .sort()
  ).toEqual(['bar', 'bar', 'foo', 'foo'])
})
