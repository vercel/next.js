import {
  shortString,
  smallNumber,
  smallBigInt,
  booleanFalse,
  nil,
  undef,
  stableLet,
  stableVar,
} from 'short-constants'
import { regex } from 'identity-values'
import {
  longString,
  nan,
  positiveInfinity,
  negativeInfinity,
} from 'long-values'
import shortDefault from 'short-default'
import longDefault from 'long-default'
import { mode } from 'analysis-constant'
import { effectValue } from 'effect-constant'
import { reassigned } from 'reassigned-binding'
import * as staticNamespace from 'namespace-static'
import * as escapingNamespace from 'namespace-escape'

const escapedNamespace = escapingNamespace

if (mode !== 'dev') {
  require('./marker')
}

function readShortValues() {
  return [
    shortString,
    smallNumber,
    smallBigInt,
    booleanFalse,
    nil,
    undef,
    stableLet,
    stableVar,
  ]
}

function readMode() {
  return mode
}

function readStaticNamespace() {
  return staticNamespace.short
}

function readShortDefault() {
  return shortDefault
}

it('inlines short primitive exports during code generation', () => {
  expect(readShortValues()).toEqual([
    'dev',
    1,
    1n,
    false,
    null,
    undefined,
    'let',
    'var',
  ])
  expect(readMode()).toBe('dev')
  expect(readStaticNamespace()).toBe('ns')
  expect(readShortDefault()).toBe('def')

  const source = readShortValues.toString()
  expect(source).toContain('"dev"')
  expect(source).toContain('1n')
  expect(source).toContain('false')
  expect(source).toContain('null')
  expect(source).toContain('void 0')
  expect(source).not.toContain('TURBOPACK compile-time value')
  expect(source).not.toContain('shortString')
  expect(source).not.toContain('smallNumber')
  expect(readStaticNamespace.toString()).not.toContain('staticNamespace')
  expect(readShortDefault.toString()).toContain('"def"')
  expect(readShortDefault.toString()).not.toContain('shortDefault')
})

it('omits inlined export modules without using values for analysis', () => {
  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).not.toContainEqual(
    expect.stringMatching(/node_modules\/short-constants\/index\.js/)
  )
  expect(modules).not.toContainEqual(
    expect.stringMatching(/node_modules\/analysis-constant\/index\.js/)
  )
  expect(modules).not.toContainEqual(
    expect.stringMatching(/node_modules\/namespace-static\/index\.js/)
  )
  expect(modules).not.toContainEqual(
    expect.stringMatching(/node_modules\/short-default\/index\.js/)
  )
  expect(modules).toContainEqual(expect.stringMatching(/input\/marker\.js/))
})

it('preserves evaluation references for side-effectful modules', () => {
  expect(effectValue).toBe('ok')
  expect(globalThis.inlineExportSideEffect).toBe(1)

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).toContainEqual(
    expect.stringMatching(/node_modules\/effect-constant\/index\.js/)
  )
})

it('does not inline reassigned bindings, identity values, long values, or escaping namespaces', () => {
  expect(reassigned).toBe('b')
  expect(escapedNamespace.short).toBe('ns')
  expect(regex).toBe(regex)
  expect(longString).toBe('this value is deliberately too long')
  expect(nan).toBeNaN()
  expect(positiveInfinity).toBe(Infinity)
  expect(negativeInfinity).toBe(-Infinity)
  expect(longDefault).toBe('this default value is too long')

  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).toContainEqual(
    expect.stringMatching(/node_modules\/reassigned-binding\/index\.js/)
  )
  expect(modules).toContainEqual(
    expect.stringMatching(/node_modules\/namespace-escape\/index\.js/)
  )
  expect(modules).toContainEqual(
    expect.stringMatching(/node_modules\/identity-values\/index\.js/)
  )
  expect(modules).toContainEqual(
    expect.stringMatching(/node_modules\/long-values\/index\.js/)
  )
  expect(modules).toContainEqual(
    expect.stringMatching(/node_modules\/long-default\/index\.js/)
  )
})
