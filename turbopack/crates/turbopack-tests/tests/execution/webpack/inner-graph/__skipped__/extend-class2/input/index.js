import {
  exportsInfoForA as declA,
  exportsInfoForB as declB,
  exportsInfoForC as declC,
  exportsInfoForD as declD,
  exportsInfoForE as declE,
  exportsInfoForF as declF,
  exportsInfoForFoo as declFoo,
  exportsInfoForPure as declPure,
  exportsInfoForDateFormatter as declDateFormatter,
  exportsInfoForConditionalExpression as declConditionalExpression,
  exportsInfoForLogicalExpression as declLogicalExpression,
} from './dep2?decl'
import {
  exportsInfoForA as exprA,
  exportsInfoForB as exprB,
  exportsInfoForC as exprC,
  exportsInfoForD as exprD,
  exportsInfoForE as exprE,
  exportsInfoForF as exprF,
  exportsInfoForPure as exprPure,
  exportsInfoForDateFormatter as exprDateFormatter,
  exportsInfoForConditionalExpression as exprConditionalExpression,
  exportsInfoForLogicalExpression as exprLogicalExpression,
} from './dep2?expr'

it('should load module correctly', () => {
  require('./module-decl')
  require('./module-expr')
})

it('A should be used', () => {
  expect(declA).toBe(true)
  expect(exprA).toBe(true)
})

if (process.env.NODE_ENV === 'production') {
  it('B should not be used', () => {
    expect(declB).toBe(false)
    expect(exprB).toBe(false)
  })
}

it('C should be used', () => {
  expect(declC).toBe(true)
  expect(exprC).toBe(true)
})

if (process.env.NODE_ENV === 'production') {
  it('D should not be used', () => {
    expect(declD).toBe(false)
    expect(exprD).toBe(false)
  })
}

it('E should be used', () => {
  expect(declE).toBe(true)
  expect(exprE).toBe(true)
})

it('F should be used', () => {
  if (process.env.NODE_ENV === 'production') {
    expect(declPure).toBe(false)
    expect(exprPure).toBe(false)
    expect(declConditionalExpression).toBe(false)
    expect(exprConditionalExpression).toBe(false)
    expect(declLogicalExpression).toBe(false)
    expect(exprLogicalExpression).toBe(false)
  }

  // Note: it has side-effects and is not affected by usage of the class
  expect(declF).toBe(true)
  expect(declFoo).toBe(true)
  expect(exprF).toBe(true)
  expect(declDateFormatter).toBe(true)
  expect(exprDateFormatter).toBe(true)
})
