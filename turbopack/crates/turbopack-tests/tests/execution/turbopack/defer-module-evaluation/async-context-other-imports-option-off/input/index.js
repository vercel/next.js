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

// The twin of `async-context-other-imports` with the option off: every module is evaluated before
// the module that imports it, so before a request is handled.

it('evaluates every module at startup, outside the async context of a request', async () => {
  expect(evaluatedBefore).toEqual([
    'dynamic',
    'required',
    'shared-dependency',
    'shared',
    'inner',
    'outer',
  ])
  const namespace = await request.run(
    'request 1',
    () => import('./library/dynamic.js')
  )
  expect(namespace.atEvaluation).toBe(undefined)
  expect(request.run('request 2', readDynamic)).toBe(undefined)
  const exports = request.run('request 3', () =>
    require('./library/required.js')
  )
  expect(exports.atEvaluation).toBe(undefined)
  expect(request.run('request 4', readRequired)).toBe(undefined)
  const later = await request.run('request 5', () => import('./later.js'))
  expect(later.sharedAtEvaluation).toEqual([undefined, undefined])
  expect(request.run('request 6', readShared)).toEqual([undefined, undefined])
  const laterInner = await request.run(
    'request 7',
    () => import('./later-inner.js')
  )
  expect(laterInner.innerAtEvaluation).toBe(undefined)
  expect(request.run('request 8', readInner)).toBe(undefined)
  // A module that is only loaded while a request is handled is evaluated in that async context.
  const laterCommonjs = await request.run(
    'request 9',
    () => import('./later-commonjs.js')
  )
  expect(laterCommonjs.commonjsAtEvaluation()).toBe('request 9')
  expect(events).toEqual([
    'dynamic',
    'required',
    'shared-dependency',
    'shared',
    'inner',
    'outer',
    'later',
    'later-inner',
    'commonjs',
    'later-commonjs',
  ])
})
