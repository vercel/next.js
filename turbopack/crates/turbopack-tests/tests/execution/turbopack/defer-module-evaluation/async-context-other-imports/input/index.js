import './setup.js'
import { atEvaluation as dynamicAtEvaluation } from './library/dynamic.js'
import { atEvaluation as requiredAtEvaluation } from './library/required.js'
import {
  atEvaluation as sharedAtEvaluation,
  dependencyAtEvaluation,
} from './library/shared.js'
import { innerAtEvaluation } from './library/outer.js'

const events = globalThis.deferEvents
const request = globalThis.deferRequest
const evaluatedBefore = [...events]

function readDynamic() {
  return dynamicAtEvaluation
}

function readRequired() {
  return requiredAtEvaluation
}

function readShared() {
  return [sharedAtEvaluation, dependencyAtEvaluation]
}

function readInner() {
  return innerAtEvaluation
}

// Each test reaches a deferred module while a request is handled, before anything reads its
// deferred import.

it('evaluates a deferred module that import() reaches first outside that async context', async () => {
  expect(evaluatedBefore).toEqual([])
  const namespace = await request.run(
    'request 1',
    () => import('./library/dynamic.js')
  )
  expect(namespace.atEvaluation).toBe(undefined)
  expect(request.run('request 2', readDynamic)).toBe(undefined)
  expect(events).toEqual(['dynamic'])
})

it('evaluates a deferred module that require() reaches first outside that async context', () => {
  const exports = request.run('request 3', () =>
    require('./library/required.js')
  )
  expect(exports.atEvaluation).toBe(undefined)
  expect(request.run('request 4', readRequired)).toBe(undefined)
  expect(events).toEqual(['dynamic', 'required'])
})

it('evaluates a deferred module that a module loaded later imports outside that async context', async () => {
  const later = await request.run('request 5', () => import('./later.js'))
  expect(later.sharedAtEvaluation).toEqual([undefined, undefined])
  expect(request.run('request 6', readShared)).toEqual([undefined, undefined])
  expect(events).toEqual([
    'dynamic',
    'required',
    'shared-dependency',
    'shared',
    'later',
  ])
})

it('evaluates a module that is not deferred in the async context of the import that reaches it first', async () => {
  // `inner.js` is not deferred: `outer.js`, the only module that imports it at startup, reads
  // it at its top level. It waits with `outer.js`, and a module that is loaded while a request
  // is handled imports it before the first read of `outer.js`.
  const later = await request.run('request 7', () => import('./later-inner.js'))
  expect(later.innerAtEvaluation).toBe('request 7')
  expect(request.run('request 8', readInner)).toBe('request 7')
  expect(events).toEqual([
    'dynamic',
    'required',
    'shared-dependency',
    'shared',
    'later',
    'inner',
    'later-inner',
    'outer',
  ])
})

it('evaluates a CommonJS module, which is never deferred, in the async context of its importer', async () => {
  // The import of `commonjs.js` is only read inside a function, but only a module with ES module
  // exports is deferred.
  const later = await request.run(
    'request 9',
    () => import('./later-commonjs.js')
  )
  expect(events.slice(-2)).toEqual(['commonjs', 'later-commonjs'])
  expect(later.commonjsAtEvaluation()).toBe('request 9')
})

it('evaluates a module that its importer also reads at its top level, and that importer, in the async context of the import that reaches them', async () => {
  // `later-top-level-read.js` reads one export of `top-level-read.js` at its top level, and
  // another export and the namespace object inside a function. Neither import is deferred: the
  // same importer reads the module at its top level, and a namespace object is not a named
  // export. So neither the module nor its importer, which it is merged with, is evaluated in the
  // async context of the runtime.
  const later = await request.run(
    'request 10',
    () => import('./later-top-level-read.js')
  )
  expect(events.slice(-2)).toEqual(['top-level-read', 'later-top-level-read'])
  expect(later.atEvaluation).toEqual({
    importer: 'request 10',
    imported: 'request 10',
  })
  expect(later.inFunction()).toEqual([
    'request 10',
    ['atEvaluation', 'inFunction'],
  ])
})
