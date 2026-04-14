// Warning: 'as' option is not supported — should still produce a glob with defaults
const withAs = import.meta.glob('./dir/*.js', { as: 'raw' })

// Warning: non-constant eager — should default to lazy (eager: false)
const nonConstEager = import.meta.glob('./dir2/*.js', {
  eager: Math.random() > -1,
})

// Warning: unknown option — should be ignored, glob still works
const unknown = import.meta.glob(['./dir/*.js', './dir2/*.js'], {
  exhaust: true,
})

// Warning: second argument must be an object literal
const nonObjOptions = import.meta.glob('./dir3/*.js', 'eager')

// Warning: query object with spread (non-constant key-value)
// The spread makes the object non-analyzable for that property.
// Note: the analyzer may or may not resolve the spread — we test that a
// warning is produced for the non-constant parts.

it('should still produce a lazy glob when "as" option is used', () => {
  const keys = Object.keys(withAs).sort()
  expect(keys).toEqual(['./dir/bar.js', './dir/foo.js'])
  // Should be lazy (thunks), since `as` is ignored
  expect(typeof withAs['./dir/foo.js']).toBe('function')
})

it('should default to lazy mode when eager is non-constant', () => {
  const keys = Object.keys(nonConstEager).sort()
  expect(keys).toEqual(['./dir2/qux.js'])
  // Should be lazy (thunks), since non-constant eager defaults to false
  expect(typeof nonConstEager['./dir2/qux.js']).toBe('function')
})

it('should ignore unknown options and still produce a valid glob', () => {
  const keys = Object.keys(unknown).sort()
  expect(keys).toEqual(['./dir/bar.js', './dir/foo.js', './dir2/qux.js'])
  expect(typeof unknown['./dir/foo.js']).toBe('function')
})
