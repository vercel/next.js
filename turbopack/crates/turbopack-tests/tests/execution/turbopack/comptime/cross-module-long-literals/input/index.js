import {
  LONG_STRING,
  LONG_NUMBER,
  LONG_BIG_NUMBER,
  REGEX,
  NAN,
  INFINITY,
} from './other'

function longLiterals() {
  return [LONG_STRING, LONG_NUMBER, LONG_BIG_NUMBER, REGEX]
}

function longLiteralsCondition() {
  // TODO ideally would still use for evaluation even though not inlined
  if (LONG_STRING && LONG_NUMBER && LONG_BIG_NUMBER && REGEX) {
    return 'ok'
  } else {
    return require('./dead-code')
  }
}

function nanInfinityCondition() {
  // TODO ideally would inline NaN and Infinity, but currently doesn't
  if (NAN != undefined && INFINITY) {
    return 'ok'
  } else {
    return require('./dead-code')
  }
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

it('does not use long literals, NaN and Infinity for evaluating conditions', () => {
  expect(longLiteralsCondition()).toBe('ok')
  expect(nanInfinityCondition()).toBe('ok')

  expect(longLiteralsCondition.toString()).toContain('dead-code')
  expect(nanInfinityCondition.toString()).toContain('dead-code')
})
