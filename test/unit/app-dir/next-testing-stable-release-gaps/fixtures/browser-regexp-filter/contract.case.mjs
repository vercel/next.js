import { test, describe, expect, afterAll } from 'vitest'
const trace = []
describe('GrOuP', () => {
  test('KeEp', () => {
    expect(typeof document).toBe('object')
    trace.push('first')
  })
  test('different', () => {
    throw new Error('RegExp source must filter this body')
  })
  test.skip('keep', () => {
    throw new Error('RegExp matching must preserve explicit skip')
  })
  test.todo('KEEP')
  test('kEeP', async () => {
    await Promise.resolve()
    expect(trace).toEqual(['first'])
    trace.push('second')
  })
})
test('outside', () => {
  throw new Error('RegExp source must filter the root body')
})
afterAll(() => {
  expect(trace).toEqual(['first', 'second'])
})
