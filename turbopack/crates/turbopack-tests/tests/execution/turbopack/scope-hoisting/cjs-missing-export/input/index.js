'use strict'

const { a, nope } = require('./m')
const ns = require('./m')

const viaNamespace = ns.alsoMissing
const summary = [a, nope, viaNamespace]

exports.summary = summary

it('destructuring a name the target does not export yields undefined', () => {
  expect(a).toBe(1)
  expect(nope).toBe(undefined)
})

it('a missing member read off the namespace yields undefined', () => {
  expect(viaNamespace).toBe(undefined)
})
