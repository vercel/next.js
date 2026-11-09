import './setup.js'
import { effect } from './effectful.js'
import { value as topLevelValue } from './library/top-level-read.js'
import { value as iifeValue } from './library/read-in-iife.js'
import { value, count, increment } from './library/lazy.js'
import defaultExport from './library/default-export.js'
import { never } from './library/throws.js'
import * as namespace from './library/namespace.js'
import { fromCommonJs } from './library/commonjs.js'
import commonJsDefault from './library/commonjs-default.js'
import { a } from './library/cycle-a.js'
import { readFromCycle } from './importer-in-cycle-a.js'
import { belowCycle } from './library/imports-cycle.js'
import { aboveCycle } from './library/above-imports-cycle.js'
import { loadCycle } from './library/loads-cycle.js'

const events = globalThis.deferEvents
const readAtTopLevel = topLevelValue
const readInIife = (() => iifeValue)()
// The modules that were evaluated before this one, or while it was evaluated.
const evaluatedBefore = [...events]

function evaluations(name) {
  return events.filter((event) => event === name).length
}

function readValue() {
  return value
}

function readCount() {
  return count
}

function readDefault() {
  return defaultExport
}

function readNever() {
  return never
}

function readNamespace() {
  return namespace.a + namespace.b
}

function readBelowCycle() {
  return belowCycle
}

function readAboveCycle() {
  return aboveCycle()
}

it('evaluates a module without side effects on the first read of an export', () => {
  expect(evaluatedBefore).not.toContain('lazy')
  expect(evaluations('lazy')).toBe(0)

  expect(readValue()).toBe('lazy')
  expect(evaluations('lazy')).toBe(1)

  expect(readValue()).toBe('lazy')
  expect(evaluations('lazy')).toBe(1)
})

it('keeps the bindings of a deferred module live', () => {
  expect(readCount()).toBe(0)
  increment()
  expect(readCount()).toBe(1)
  expect(evaluations('lazy')).toBe(1)
})

it('defers a default import', () => {
  expect(evaluatedBefore).not.toContain('default-export')
  expect(evaluations('default-export')).toBe(0)
  expect(readDefault()).toBe('default')
  expect(evaluations('default-export')).toBe(1)
})

it('defers a namespace import that is only read through its members', () => {
  expect(evaluatedBefore).not.toContain('namespace')
  expect(evaluations('namespace')).toBe(0)
  expect(readNamespace()).toBe(3)
  expect(evaluations('namespace')).toBe(1)
})

it('throws the evaluation error of a deferred module at every read', () => {
  expect(evaluatedBefore).not.toContain('throws')
  expect(readNever).toThrow('thrown by throws.js')
  expect(readNever).toThrow('thrown by throws.js')
  expect(evaluations('throws')).toBe(1)
})

it('evaluates a module with side effects before its importer', () => {
  expect(evaluatedBefore).toContain('effectful')
  expect(effect()).toBe('effect')
  expect(evaluations('effectful')).toBe(1)
})

it('evaluates a module that is read while its importer is evaluated before the importer', () => {
  // Before the importer and in the order of the imports, i.e. before `commonjs.js`.
  expect(evaluatedBefore).toContain('top-level-read')
  expect(evaluatedBefore.indexOf('top-level-read')).toBeLessThan(
    evaluatedBefore.indexOf('commonjs')
  )
  expect(readAtTopLevel).toBe('top-level-read')
})

it('evaluates a module on the first read when a function reads it while the importer is evaluated', () => {
  // After the other imports of the importer, e.g. `commonjs.js`.
  expect(evaluatedBefore).toContain('read-in-iife')
  expect(evaluatedBefore.indexOf('read-in-iife')).toBeGreaterThan(
    evaluatedBefore.indexOf('commonjs')
  )
  expect(readInIife).toBe('read-in-iife')
  expect(evaluations('read-in-iife')).toBe(1)
})

it('evaluates a CommonJS module before its importer', () => {
  expect(evaluatedBefore).toContain('commonjs')
  expect(fromCommonJs).toBe('commonjs')
  expect(evaluatedBefore).toContain('commonjs-default')
  expect(commonJsDefault.value).toBe('commonjs-default')
})

it('evaluates modules of an import cycle before their importer', () => {
  expect(evaluatedBefore).toContain('cycle-a')
  expect(evaluatedBefore).toContain('cycle-b')
  expect(a()).toBe('ab')
})

it('evaluates the imports of a module of an import cycle before that module', () => {
  expect(evaluatedBefore).toContain('imported-from-cycle')
  expect(evaluatedBefore.indexOf('imported-from-cycle')).toBeLessThan(
    evaluatedBefore.indexOf('importer-in-cycle-a')
  )
  expect(readFromCycle()).toBe('imported-from-cycle')
})

it('evaluates a module that imports an import cycle before its importer', () => {
  // Deferring it could let another import enter the cycle at another module (`import-cycle`).
  expect(evaluatedBefore).toContain('imports-cycle')
  expect(evaluatedBefore).toContain('below-cycle-a')
  expect(evaluatedBefore).toContain('below-cycle-b')
  expect(readBelowCycle()).toBe('ab')
  expect(evaluations('imports-cycle')).toBe(1)
  expect(evaluations('below-cycle-a')).toBe(1)
  expect(evaluations('below-cycle-b')).toBe(1)
})

it('evaluates a module that imports an import cycle through another module before its importer', () => {
  expect(evaluatedBefore).toContain('above-imports-cycle')
  expect(readAboveCycle()).toBe('ab')
  expect(evaluations('above-imports-cycle')).toBe(1)
})

it('defers a module that reaches an import cycle only through an unused import and an import()', async () => {
  // Neither evaluates the cycle with the module.
  expect(evaluatedBefore).not.toContain('loads-cycle')
  expect(evaluations('loads-cycle')).toBe(0)
  expect((await loadCycle()).a()).toBe('ab')
  expect(evaluations('loads-cycle')).toBe(1)
})
