// The fixture keeps `one.js`, `two.js` and `nested/three.js` in a sibling
// directory of `input/`, so patterns have to walk out of the importer's
// directory to find them.
//
// Vite's rule: a pattern is either relative (`./`, `../`) to the importing file
// or absolute from the project root (`/`).
// https://vite.dev/guide/features.html#glob-import-caveats

const parentEager = import.meta.glob('../outside/*.js', { eager: true })

it('should match a pattern that walks up out of the importer directory', () => {
  expect(Object.keys(parentEager)).toEqual([
    '../outside/one.js',
    '../outside/two.js',
  ])
  expect(parentEager['../outside/one.js'].default).toBe('one')
  expect(parentEager['../outside/two.js'].default).toBe('two')
})

const parentRecursive = import.meta.glob('../outside/**/*.js', { eager: true })

it('should match recursively below a parent directory', () => {
  expect(Object.keys(parentRecursive)).toEqual([
    '../outside/nested/three.js',
    '../outside/one.js',
    '../outside/two.js',
  ])
  expect(parentRecursive['../outside/nested/three.js'].default).toBe('three')
})

const parentNegative = import.meta.glob(
  ['../outside/*.js', '!../outside/two.js'],
  { eager: true }
)

it('should apply negative patterns that walk up out of the importer directory', () => {
  expect(Object.keys(parentNegative)).toEqual(['../outside/one.js'])
})

// Absolute from the directory a `/`-rooted request resolves from, which in this
// test suite is the test's own directory rather than the root of the filesystem.
const absolute = import.meta.glob('/outside/*.js', { eager: true })

it('should match a pattern that is absolute from the root of the project', () => {
  expect(Object.keys(absolute)).toEqual(['/outside/one.js', '/outside/two.js'])
  expect(absolute['/outside/one.js'].default).toBe('one')
})

const mixedRoots = import.meta.glob(['./local/*.js', '../outside/one.js'], {
  eager: true,
})

// A negative pattern may be rooted above the positive patterns.
const mixedRootsNegative = import.meta.glob(
  ['../outside/*.js', '!/outside/two.js'],
  { eager: true }
)

it('should merge patterns rooted in different directories', () => {
  expect(Object.keys(mixedRoots).sort()).toEqual([
    '../outside/one.js',
    './local/local.js',
  ])
  expect(mixedRoots['./local/local.js'].default).toBe('local')
  expect(mixedRoots['../outside/one.js'].default).toBe('one')
})

it('should apply a negative pattern rooted above the positive patterns', () => {
  expect(Object.keys(mixedRootsNegative)).toEqual(['../outside/one.js'])
})

// `base` moves the directory the pattern is resolved against *and* the keys are
// relative to it. https://vite.dev/guide/features.html#base-path
const withBase = import.meta.glob('*.js', {
  base: '../outside',
  eager: true,
})

it('should key results relative to base', () => {
  expect(Object.keys(withBase)).toEqual(['./one.js', './two.js'])
  expect(withBase['./one.js'].default).toBe('one')
  expect(withBase['./two.js'].default).toBe('two')
})

const withBaseRecursive = import.meta.glob('**/*.js', {
  base: '../outside',
  eager: true,
})

it('should key nested results relative to base', () => {
  expect(Object.keys(withBaseRecursive)).toEqual([
    './nested/three.js',
    './one.js',
    './two.js',
  ])
})

const withBaseNegative = import.meta.glob(['*.js', '!two.js'], {
  base: '../outside',
  eager: true,
})

it('should apply negative patterns relative to base', () => {
  expect(Object.keys(withBaseNegative)).toEqual(['./one.js'])
})

// A `base` that itself walks up and back down again.
const withParentBase = import.meta.glob('*.js', {
  base: '../../import-meta-glob-relative/outside',
  eager: true,
})

it('should normalize a base that walks up and back down', () => {
  expect(Object.keys(withParentBase)).toEqual(['./one.js', './two.js'])
})

// Control: patterns relative to the importer keep their `./`-prefixed keys.
const local = import.meta.glob('./local/*.js', { eager: true })

it('should keep origin-relative keys when no base is given', () => {
  expect(Object.keys(local)).toEqual(['./local/local.js'])
  expect(local['./local/local.js'].default).toBe('local')
})
