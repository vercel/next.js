import { FIRST, SECOND } from 'shorthand-constants'

function readConstants() {
  return { FIRST, SECOND }
}

it('inlines analyzer-aware constants in shorthand properties', () => {
  expect(readConstants()).toEqual({ FIRST: 'first', SECOND: 'second' })

  const source = readConstants.toString()
  expect(source).toContain('FIRST:')
  expect(source).toContain('SECOND:')
  expect(source).toContain('TURBOPACK compile-time value')
})
