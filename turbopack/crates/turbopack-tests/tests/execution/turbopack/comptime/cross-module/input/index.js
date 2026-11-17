import { IS_DEV, SOME_VALUE } from './other'

function someValue() {
  if (SOME_VALUE === 'x') {
    return SOME_VALUE
  } else {
    return require('./dead-code')
  }
}

function isDev() {
  if (IS_DEV) {
    return require('./dead-code')
  } else {
    return IS_DEV
  }
}

it('inlines a constant export of another module', () => {
  expect(someValue()).toBe('x')

  const code = someValue.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "x"')
  expect(code).not.toContain('dead-code')
})

it('inlines a constant export computed from other constants', () => {
  // `NODE_ENV` is `production` in execution tests.
  expect(isDev()).toBe(false)

  const code = isDev.toString()
  expect(code).toContain('"TURBOPACK compile-time value", false')
  expect(code).not.toContain('dead-code')
})
