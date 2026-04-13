// Lazy (default): each value is a thunk () => Promise<module>
const lazyModules = import.meta.glob('./dir/*.js')

it('should return a thunk for each matched file in lazy mode', async () => {
  const keys = Object.keys(lazyModules).sort()
  expect(keys).toEqual(['./dir/bar.js', './dir/foo.js'])

  const foo = await lazyModules['./dir/foo.js']()
  expect(foo.default).toBe('foo')

  const bar = await lazyModules['./dir/bar.js']()
  expect(bar.default).toBe('bar')
})

// Eager: each value is the module object directly
const eagerModules = import.meta.glob('./dir/*.js', { eager: true })

it('should expose module objects directly in eager mode', () => {
  const keys = Object.keys(eagerModules).sort()
  expect(keys).toEqual(['./dir/bar.js', './dir/foo.js'])
  expect(eagerModules['./dir/foo.js'].default).toBe('foo')
  expect(eagerModules['./dir/bar.js'].default).toBe('bar')
})

// Named import: each thunk resolves to a single named export
const namedModules = import.meta.glob('./dir/*.js', { import: 'default' })

it('should resolve to the named export when import option is set', async () => {
  const fooDefault = await namedModules['./dir/foo.js']()
  expect(fooDefault).toBe('foo')

  const barDefault = await namedModules['./dir/bar.js']()
  expect(barDefault).toBe('bar')
})

// Eager + named import
const eagerNamed = import.meta.glob('./dir/*.js', {
  import: 'value',
  eager: true,
})

it('should resolve to the named export eagerly', () => {
  expect(eagerNamed['./dir/foo.js']).toBe(42)
  expect(eagerNamed['./dir/bar.js']).toBe(99)
})

// Negative pattern: exclude bar.js
const filteredModules = import.meta.glob(['./dir/*.js', '!**/bar.js'])

it('should exclude files matching negative patterns', () => {
  const keys = Object.keys(filteredModules)
  expect(keys).toEqual(['./dir/foo.js'])
})

// Multiple patterns across directories
const multiModules = import.meta.glob(['./dir/*.js', './other/*.js'], {
  eager: true,
})

it('should support multiple patterns across directories', () => {
  const keys = Object.keys(multiModules).sort()
  expect(keys).toEqual(['./dir/bar.js', './dir/foo.js', './other/baz.js'])
  expect(multiModules['./other/baz.js'].default).toBe('baz')
})
