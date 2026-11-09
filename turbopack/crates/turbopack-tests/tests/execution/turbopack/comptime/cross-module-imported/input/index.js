// Imported values that are (re)exported aren't inlined yet, see
// `__skipped__/cross-module-imported-reexports`.
import { SOME_VALUE } from './other'

function someValue() {
  if (SOME_VALUE === 'x') {
    return SOME_VALUE
  } else {
    return require('./dead-code')
  }
}

it('inlines a constant export', () => {
  expect(someValue()).toBe('x')

  const code = someValue.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "x"')
  expect(code).not.toContain('dead-code')
})
