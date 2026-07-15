'use strict'

const { log } = require('./order')

log.push('before')
const { name } = require('./a')
log.push('after')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it. Snapshotting
// the log at module-evaluation time also pins down when the entry body runs.
const sequence = log.join(',')

exports.sequence = sequence

it('inlines a required module at the require site, preserving order', () => {
  // `order` is shared and must run exactly once; `a` runs where it is required
  // (between `before` and `after`), not hoisted above the earlier side effect.
  expect(log).toEqual(['before', 'a', 'after'])
  expect(sequence).toBe('before,a,after')
  expect(name).toBe('a')
})
