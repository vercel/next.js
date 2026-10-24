import client from './client#component'
import nofrag from './nofrag#frag'
import client2 from './client#component.js'
import nofrag2 from './nofrag.js#frag'

it('should resolve to a file with a fragment', () => {
  expect(client).toBe('client#component')
})

it('should resolve to a file without a fragment', () => {
  expect(nofrag).toBe('nofrag')
})

it('should resolve to a file with a fragment and an extension', () => {
  expect(client2).toBe('client#component')
})

it('should resolve to a file without a fragment but with an extension', () => {
  expect(nofrag2).toBe('nofrag')
})

it('dynamic with fragments', async () => {
  const helper = async (p) => {
    return (await import('./' + p + '#frag')).default
  }
  expect(await helper('nofrag.js')).toBe('nofrag')
  expect(await helper('nofrag')).toBe('nofrag')
})

it('should prefer literal hash paths for CommonJS', () => {
  expect(require('./client#component.js').default).toBe('client#component')
  expect(require('./nofrag.js#frag').default).toBe('nofrag')

  const contains = require('literal-hash-package/string/#/contains')
  expect(contains.call('turbopack', 'pack')).toBe(true)
  expect(require.resolve('literal-hash-package/string/#/contains')).toBe(
    require.resolve('./node_modules/literal-hash-package/string/#/contains')
  )
  expect(Array.from(__turbopack_modules__.keys())).not.toContainEqual(
    expect.stringMatching(/literal-hash-package\/string\/(index|unwanted)\.js/)
  )
})
