import './setup.js'
import { effect } from './effectful.js'
import { value as topLevelValue } from './library/top-level-read.js'
import { value, count, increment } from './library/lazy.js'
import { never } from './library/throws.js'
import * as namespace from './library/namespace.js'
import * as escapedNamespace from './library/escaped-namespace.js'
import { readDependency } from './library/imports-effect.js'
import { fromCommonJs } from './library/commonjs.js'
import { a } from './library/cycle-a.js'
import * as reexports from './reexports.js'

const events = globalThis.deferEvents
const readAtTopLevel = topLevelValue
// The modules that were evaluated before this one.
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

function readNever() {
  return never
}

function readNamespace() {
  return namespace.a + namespace.b
}

function readEscapedNamespace() {
  return Object.keys(escapedNamespace)
}

function readReexports() {
  return Object.keys(reexports)
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

it('evaluates a module that imports a module with side effects before its importer', () => {
  expect(evaluatedBefore).toContain('dependency-with-effect')
  expect(evaluatedBefore).toContain('imports-effect')
  expect(readDependency()).toBe('dependency')
})

it('evaluates a module that is read while its importer is evaluated before the importer', () => {
  expect(evaluatedBefore).toContain('top-level-read')
  expect(readAtTopLevel).toBe('top-level-read')
})

it('evaluates a module whose namespace object is used before its importer', () => {
  expect(evaluatedBefore).toContain('escaped-namespace')
  expect(readEscapedNamespace()).toEqual(['a'])
})

it('evaluates a re-exported module before the module that re-exports it', () => {
  expect(evaluatedBefore).toContain('reexported')
  expect(evaluatedBefore).toContain('reexports')
  expect(readReexports()).toEqual(['reexported'])
  expect(evaluations('reexported')).toBe(1)
})

it('evaluates a CommonJS module before its importer', () => {
  expect(evaluatedBefore).toContain('commonjs')
  expect(fromCommonJs).toBe('commonjs')
})

it('evaluates modules of an import cycle before their importer', () => {
  expect(evaluatedBefore).toContain('cycle-a')
  expect(evaluatedBefore).toContain('cycle-b')
  expect(a()).toBe('ab')
})
