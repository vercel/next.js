// `other.js` uses the `'use turbopack: constants'` directive, which requires
// all of its exports to be constants. Non-constant exports and missing exports
// are reported as issues (see `issues/`).
import {
  SOME_VALUE,
  NO_CONSTANT,
  MISSING,
  LONG_STRING,
  LONG_NUMBER,
  LONG_BIG_NUMBER,
  LONG_REGEX,
} from './other'

function someValue() {
  if (SOME_VALUE === 'x') {
    return SOME_VALUE
  } else {
    return require('./dead-code')
  }
}

function notConstants() {
  return [NO_CONSTANT, MISSING]
}

function longLiterals() {
  return [LONG_STRING, LONG_NUMBER, LONG_BIG_NUMBER, LONG_REGEX]
}

it('inlines a constant export', () => {
  expect(someValue()).toBe('x')

  const code = someValue.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "x"')
  expect(code).not.toContain('dead-code')
})

it('does not inline non-constant and missing exports', () => {
  expect(notConstants()).toEqual([undefined, undefined])

  expect(notConstants.toString()).not.toContain('TURBOPACK compile-time')
})

it('inlines long literals when constants are enforced', () => {
  expect(longLiterals()).toEqual([
    'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789',
    21345672345678345678901234567890,
    21345672345678345678901234567890n,
    /abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789/i,
  ])

  const code = longLiterals.toString()
  expect(code.match(/TURBOPACK compile-time value/g)).toHaveLength(4)
})
