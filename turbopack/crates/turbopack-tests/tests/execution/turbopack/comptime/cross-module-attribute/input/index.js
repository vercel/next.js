import { lower } from './other' with { turbopackConstants: 'true' }
import { UPPER } from './other' with { turbopackConstants: 'false' }
import { nonConstant } from './non-constant' with { turbopackConstants: 'true' }

function readLower() {
  if (lower === 'lowercase') {
    return lower
  } else {
    return require('./dead-code')
  }
}

function readUpper() {
  if (UPPER === 'UPPER') {
    return UPPER
  } else {
    return require('./correct-not-inlined')
  }
}

function readNonConstant() {
  if (nonConstant.v === 1234) {
    return nonConstant
  } else {
    return require('./correct-not-inlined')
  }
}

it('inlines constants imported with `turbopackConstants: true`', () => {
  expect(readLower()).toBe('lowercase')

  const code = readLower.toString()
  expect(code).toContain('"TURBOPACK compile-time value", "lowercase"')
  expect(code).not.toContain('dead-code')
})

it('does not inline constants imported with `turbopackConstants: false`', () => {
  expect(readUpper()).toBe('UPPER')

  const code = readUpper.toString()
  expect(code).not.toContain('TURBOPACK compile-time')
  expect(code).toContain('correct-not-inlined')
})

it('reports non-constant exports imported with `turbopackConstants: true`', () => {
  // The error is reported as an issue (see `issues/`).
  expect(readNonConstant()).toEqual({ v: 1234 })

  const code = readNonConstant.toString()
  expect(code).not.toContain('TURBOPACK compile-time')
  expect(code).toContain('correct-not-inlined')
})
