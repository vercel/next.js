import './setup.js'
// Merged with this module: it is read while this module is evaluated.
import { readRoot } from './reads-root.js'

const read = readRoot
const evaluatedBefore = [...globalThis.deferEvents]

it('evaluates a deferred module and the modules merged with it on the first read', () => {
  expect(evaluatedBefore).toEqual([])

  expect(read()).toBe('part of root')
  expect(globalThis.deferEvents).toEqual(['part', 'root'])

  expect(read()).toBe('part of root')
  expect(globalThis.deferEvents).toEqual(['part', 'root'])
})

it('evaluates a module once when several modules defer it', () => {
  // Loaded with `require`, so it is not merged with this module.
  const other = require('./reads-root-too.js')
  expect(other.readRootToo()).toBe('part of root')
  expect(globalThis.deferEvents).toEqual(['part', 'root'])
})
