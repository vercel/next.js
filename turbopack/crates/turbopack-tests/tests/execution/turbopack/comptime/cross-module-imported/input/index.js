import {
  SOME_VALUE,
  IMPORTED_EXPORTED,
  REEXPORTED,
  USING_IMPORTED_EXPORTED,
} from './other'

function someValue() {
  if (SOME_VALUE === 'x') {
    return SOME_VALUE
  } else {
    return require('./dead-code')
  }
}

function notConstants() {
  return [IMPORTED_EXPORTED, REEXPORTED, USING_IMPORTED_EXPORTED]
}

it('inlines a constant export', () => {
  expect(someValue()).toBe('x')

  const code = someValue.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "x"')
  expect(code).not.toContain('dead-code')
})

it('does not consider imported values that are (re)exported to be constants', () => {
  expect(notConstants()).toEqual([
    'imported exported',
    'reexported',
    'ximported exported',
  ])

  const code = notConstants.toString()
  expect(code).not.toContain('TURBOPACK compile-time')
})
