import { describe, test } from 'vitest'
describe.only('focused', () => {
  test('inherited', () => {})
  describe('nested', () => {
    test.only('chosen', () => {})
    test('also inherited', () => {})
  })
})
