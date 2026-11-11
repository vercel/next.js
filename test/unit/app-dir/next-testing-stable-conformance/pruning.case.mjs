import { expect, test } from 'vitest'

test('retained snapshot', () => {
  expect('retained').toMatchSnapshot()
})
test.skip('skipped snapshot', () => {
  expect('skipped').toMatchSnapshot()
})
