'use strict'

// Both requires are lexically at the top level, but only one is ever evaluated.
const pick = globalThis.__pickA !== false ? require('./a') : require('./b')

exports.picked = pick.name

it('only evaluates the branch that is taken', () => {
  expect(pick.name).toBe('a')
  expect(globalThis.__aEvaluated).toBe(1)
  expect(globalThis.__bEvaluated).toBe(undefined)
})
