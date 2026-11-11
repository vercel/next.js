// Long literals aren't inlined. They aren't used to evaluate conditions yet either, see
// `__skipped__/cross-module-long-literal-conditions`.
import { LONG_STRING, LONG_NUMBER, LONG_BIG_NUMBER, REGEX } from './other'

function longLiterals() {
  return [LONG_STRING, LONG_NUMBER, LONG_BIG_NUMBER, REGEX]
}

it('does not inline long literals', () => {
  expect(longLiterals()).toEqual([
    'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789',
    21345672345678345678901234567890,
    21345672345678345678901234567890n,
    /ab/i,
  ])

  expect(longLiterals.toString()).not.toContain('TURBOPACK compile-time')
})
