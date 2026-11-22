// Expected to fail: long literals, `NaN` and `Infinity` aren't inlined, but they could still be
// used to evaluate conditions at compile time. They aren't yet.
import {
  LONG_STRING,
  LONG_NUMBER,
  LONG_BIG_NUMBER,
  REGEX,
  NAN,
  INFINITY,
} from './other'

function longLiteralsCondition() {
  if (LONG_STRING && LONG_NUMBER && LONG_BIG_NUMBER && REGEX) {
    return 'ok'
  } else {
    return require('./dead-code')
  }
}

function nanInfinityCondition() {
  if (NAN != undefined && INFINITY) {
    return 'ok'
  } else {
    return require('./dead-code')
  }
}

it('uses long literals for evaluating conditions', () => {
  expect(longLiteralsCondition()).toBe('ok')
  expect(longLiteralsCondition.toString()).not.toContain('dead-code')
})

it('uses NaN and Infinity for evaluating conditions', () => {
  expect(nanInfinityCondition()).toBe('ok')
  expect(nanInfinityCondition.toString()).not.toContain('dead-code')
})
