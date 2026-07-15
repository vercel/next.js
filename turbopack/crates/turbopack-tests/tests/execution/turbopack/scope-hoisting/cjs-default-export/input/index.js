'use strict'

const d = require('./dep')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it. Re-exporting
// under `default` also exercises the reserved-word local rename in the merged
// scope on both sides of the require.
const combined = `${d.default}/${d.named}`

exports.default = combined

it('scope-hoists a CJS module with a reserved-word (default) export', () => {
  expect(d.default).toBe('the-default')
  expect(d.named).toBe('the-named')
  expect(combined).toBe('the-default/the-named')
})
