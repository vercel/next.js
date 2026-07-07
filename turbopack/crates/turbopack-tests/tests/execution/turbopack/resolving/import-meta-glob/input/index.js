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

// import: '*' (namespace import) — should return the whole module namespace
// Uses ./other/*.js to avoid colliding with the eager test above (same pattern + eager + no import)
const namespaceModules = import.meta.glob('./other/*.js', {
  import: '*',
  eager: true,
})

it('should return the whole module namespace with import: "*"', () => {
  const keys = Object.keys(namespaceModules).sort()
  expect(keys).toEqual(['./other/baz.js'])
  // Each value is the full module namespace object
  expect(namespaceModules['./other/baz.js'].default).toBe('baz')
  expect(namespaceModules['./other/baz.js'].value).toBe(7)
})

// Negative pattern combined with query
const queryWithNeg = import.meta.glob(['./dir/*.js', '!**/bar.js'], {
  query: '?raw',
  import: '*',
})

it('should support query option with negative patterns', () => {
  const keys = Object.keys(queryWithNeg)
  expect(keys).toEqual(['./dir/foo.js'])
  // Values are thunks (lazy mode)
  expect(typeof queryWithNeg['./dir/foo.js']).toBe('function')
})

// query as object literal — serialized to query string
const queryObjModules = import.meta.glob('./dir/*.js', {
  query: { bar: 'foo', raw: true },
})

it('should support query as object literal', () => {
  const keys = Object.keys(queryObjModules).sort()
  expect(keys).toEqual(['./dir/bar.js', './dir/foo.js'])
  // Values are thunks (lazy)
  expect(typeof queryObjModules['./dir/foo.js']).toBe('function')
})

// Dotfile directories are matched by wildcards (not excluded)
const dotfileGlob = import.meta.glob(['./**/*.js', '!./index.js'], {
  eager: true,
})

it('should include dotfile directories with wildcard patterns', () => {
  const keys = Object.keys(dotfileGlob).sort()
  expect(keys).toEqual([
    './.foo/hidden.js',
    './dir/bar.js',
    './dir/foo.js',
    './other/baz.js',
  ])
})

// Dotfile directories targeted explicitly should be included
const dotfileExplicit = import.meta.glob('./.foo/*.js', { eager: true })

it('should include dotfile directories when explicitly targeted', () => {
  const keys = Object.keys(dotfileExplicit)
  expect(keys).toEqual(['./.foo/hidden.js'])
})
