import { SOME_VALUE, BARREL_VALUE, foo } from './library'

function someValue() {
  if (SOME_VALUE === 'x') {
    return SOME_VALUE
  } else {
    return require('./dead-code')
  }
}

function barrelValue() {
  if (BARREL_VALUE === 'barrel') {
    return BARREL_VALUE
  } else {
    return require('./dead-code')
  }
}

it('inlines a constant reexported through a side-effect-free barrel', () => {
  expect(someValue()).toBe('x')

  const code = someValue.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "x"')
  expect(code).not.toContain('dead-code')
})

it('inlines a constant declared in a side-effect-free barrel', () => {
  expect(barrelValue()).toBe('barrel')

  const code = barrelValue.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "barrel"')
  expect(code).not.toContain('dead-code')
})

it('keeps non-constant exports of the barrel working', () => {
  expect(foo()).toBe(123)
})
