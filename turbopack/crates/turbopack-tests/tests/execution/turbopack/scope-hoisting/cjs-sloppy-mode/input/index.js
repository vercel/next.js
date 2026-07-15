'use strict'

const { value } = require('./sloppy')

exports.result = value

it('preserves sloppy-mode semantics of a hoisted CommonJS module', () => {
  expect(value).toBe(42)
})
