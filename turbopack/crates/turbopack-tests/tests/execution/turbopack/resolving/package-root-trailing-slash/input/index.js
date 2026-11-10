function load(suffix) {
  return require('package-with-main/' + suffix)
}

it('resolves static package roots through the main field', () => {
  expect(require('package-with-main')).toBe('main')
  expect(require('package-with-main/')).toBe('main')
})

it('resolves a dynamic trailing-slash package root', () => {
  expect(load('')).toBe('main')
})

it('preserves dynamic subpath resolution', () => {
  expect(load('main.js')).toBe('main')
  expect(load('index.js')).toBe('index')
  expect(load('subpath.js')).toBe('subpath')
})

it('rejects missing dynamic subpaths', () => {
  expect(() => load('missing.js')).toThrow(
    "Cannot find module 'package-with-main/missing.js'"
  )
})
