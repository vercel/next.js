import {
  SHORT_NUMBER,
  LONG_NUMBER,
  SHORT_NEGATIVE_NUMBER,
  LONG_NEGATIVE_NUMBER,
  SHORT_BIGINT,
  LONG_BIGINT,
  SHORT_FRACTION,
  LONG_FRACTION,
} from './values'
import {
  LONG_NUMBER as FORCED_NUMBER,
  LONG_BIGINT as FORCED_BIGINT,
} from './values' with { turbopackConstants: 'true' }

// Each function uses a single import so the compile-time marker proves that
// specific value was inlined (or retained as a runtime binding).
const shortNumber = () => SHORT_NUMBER
const longNumber = () => LONG_NUMBER
const shortNegativeNumber = () => SHORT_NEGATIVE_NUMBER
const longNegativeNumber = () => LONG_NEGATIVE_NUMBER
const shortBigInt = () => SHORT_BIGINT
const longBigInt = () => LONG_BIGINT
const shortFraction = () => SHORT_FRACTION
const longFraction = () => LONG_FRACTION
const forcedNumber = () => FORCED_NUMBER
const forcedBigInt = () => FORCED_BIGINT

it('automatically inlines literals up to six characters including signs and bigint suffixes', () => {
  for (const [fn, value] of [
    [shortNumber, 999999],
    [shortNegativeNumber, -99999],
    [shortBigInt, 99999n],
    [shortFraction, 0.1234],
  ]) {
    expect(fn()).toBe(value)
    expect(fn.toString()).toContain('TURBOPACK compile-time value')
  }
})

it('retains literals longer than six characters as runtime bindings', () => {
  for (const [fn, value] of [
    [longNumber, 1000000],
    [longNegativeNumber, -100000],
    [longBigInt, 100000n],
    [longFraction, 0.12345],
  ]) {
    expect(fn()).toBe(value)
    expect(fn.toString()).not.toContain('TURBOPACK compile-time value')
  }
})

it('keeps explicit constants opt-in independent of the automatic size limit', () => {
  expect(forcedNumber()).toBe(1000000)
  expect(forcedBigInt()).toBe(100000n)
  expect(forcedNumber.toString()).toContain('TURBOPACK compile-time value')
  expect(forcedBigInt.toString()).toContain('TURBOPACK compile-time value')
})
