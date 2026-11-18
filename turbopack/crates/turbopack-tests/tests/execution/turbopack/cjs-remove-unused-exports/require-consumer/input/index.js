import { used } from './lib.js'

// A wholesale `require()` consumer reports `ExportUsage::All`, so the graph must
// mark every export used and nothing may be dropped.
const lib = require('./lib.js')

it('keeps all exports when a module is also required wholesale', () => {
  expect(used).toBe('used-value')
  expect(lib).toEqual({
    used: 'used-value',
    unused: 'unused-value',
  })
})
