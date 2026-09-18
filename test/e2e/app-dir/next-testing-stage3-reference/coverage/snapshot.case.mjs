import { expect, it } from 'vitest'

it('keeps the original snapshot', () => {
  console.log('L3_UNEXPECTED_COVERAGE_SNAPSHOT_BODY')
  expect('changed').toMatchSnapshot()
})
