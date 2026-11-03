const eagerNamed = import.meta.glob('./dir/*.js', {
  import: 'value',
  eager: true,
})

it('should return the named exports when export names are mangled', () => {
  expect(eagerNamed['./dir/foo.js']).toBe(42)
  expect(eagerNamed['./dir/bar.js']).toBe(99)
})
