import { test, expect, describe } from 'vitest'
describe('parent', () => {
  test('custom hint', () =>
    expect({ a: 1 }).toMatchSnapshot('descriptive hint'))
  test('thrown error', () =>
    expect(() => {
      throw new Error('saved failure')
    }).toThrowErrorMatchingSnapshot())
})
