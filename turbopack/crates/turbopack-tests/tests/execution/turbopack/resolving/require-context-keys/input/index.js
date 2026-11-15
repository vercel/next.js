// Like webpack, a file in a context can be requested in every way it resolves:
// with and without its extension, and as a directory when it is an index file.
const ctx = require.context('./deps', true)

it('lists every key a file can be requested by, sorted', () => {
  // `.` is a key of the index file too, but the default filter only matches keys
  // starting with `./`.
  expect(ctx.keys()).toEqual([
    './',
    './bar',
    './bar/',
    './bar/index',
    './bar/index.js',
    './foo',
    './foo.js',
    './foo/',
    './foo/index',
    './foo/index.js',
    './index',
    './index.js',
  ])
})

it('resolves each key like a require from the context directory', () => {
  expect(ctx('./')).toBe('root')
  expect(ctx('./bar')).toBe('bar dir')
  // A file is preferred over a directory of the same name.
  expect(ctx('./foo')).toBe('foo file')
  expect(ctx('./foo/')).toBe('foo dir')
  expect(ctx.resolve('./foo')).toBe(require.resolve('./deps/foo.js'))
})

// The modules are only reached through `require.resolve` in the synthetic module,
// which must still count as using all of their exports, or tree shaking and export
// mangling would drop or rename them.
it('keeps every export of a module reached through the context', () => {
  const esm = require.context('./esm', false, /\.js$/)
  const module = esm('./module.js')
  expect(module.named).toBe('named export')
  expect(module.default).toBe('default export')
  expect(Object.keys(module).sort()).toEqual(['default', 'named', 'unused'])
})
