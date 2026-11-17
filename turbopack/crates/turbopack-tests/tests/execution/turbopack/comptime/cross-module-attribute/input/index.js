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

// The `else` branches below require modules that don't exist. When the condition isn't evaluated
// at compile time, the branch is kept and the missing module is reported as an issue (see
// `issues/`). It is never executed at runtime.

function readUpper() {
  if (UPPER === 'UPPER') {
    return UPPER
  } else {
    return require('./missing-upper')
  }
}

function readNonConstant() {
  if (nonConstant.v === 1234) {
    return nonConstant
  } else {
    return require('./missing-non-constant')
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
  expect(code).toContain('missing-upper')
})

it('reports non-constant exports imported with `turbopackConstants: true`', () => {
  // The error is reported as an issue (see `issues/`).
  expect(readNonConstant()).toEqual({ v: 1234 })

  const code = readNonConstant.toString()
  expect(code).not.toContain('TURBOPACK compile-time')
  expect(code).toContain('missing-non-constant')
})
