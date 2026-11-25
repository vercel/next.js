// An eager match with top-level await makes the importing module async, so its
// value is ready by the time the importing module runs.
const modules = import.meta.glob('./dir/*.js', { eager: true })

it('should wait for an eager match that uses top-level await', () => {
  expect(modules['./dir/async.js'].value).toBe('async value')
  expect(modules['./dir/sync.js'].value).toBe('sync value')
})

// Only an ES module can become async, and without an import or export this
// module would be treated as CommonJS.
export {}
