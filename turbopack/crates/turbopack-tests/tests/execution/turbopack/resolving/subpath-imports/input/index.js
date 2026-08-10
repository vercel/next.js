import foo from '#foo'
import dep from '#dep'
import pattern from '#pattern/pat.js'
import conditionalImport from '#conditional'
const conditionalRequire = require('#conditional')

it('should resolve subpath imports', () => {
  expect(foo).toBe('foo')
  expect(dep).toBe('dep')
  expect(pattern).toBe('pat')
  expect(conditionalImport).toBe('import')
  expect(conditionalRequire).toBe('require')
})
