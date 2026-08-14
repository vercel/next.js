'use strict'

const { greeting } = require('./esm')
const { default: esmDefault } = require('./esm')
const ns = require('./esm')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it.
exports.greeting = greeting

it('reads a named ESM export through require', () => {
  expect(greeting).toBe('hi')
})

it('reads the ESM default export through require', () => {
  expect(typeof esmDefault).toBe('function')
  expect(esmDefault()).toBe('default-fn')
})

it('reads the ESM namespace and __esModule flag', () => {
  expect(ns.PI).toBe(3.14)
  expect(ns.greeting).toBe('hi')
  expect(ns.__esModule).toBe(true)
})

it('sees live ESM bindings through the namespace', () => {
  expect(ns.counter).toBe(0)
  ns.bump()
  expect(ns.counter).toBe(1)
})
