import { expect, it } from 'vitest'

let attempt = 0
it('selected', { retry: 1 }, () => {
  expect(attempt === 0 ? 'failed value' : 'final value').toMatchSnapshot()
  if (attempt++ === 0) {
    expect('failed extra').toMatchSnapshot('extra')
    throw new Error('L_EXPECTED_SNAPSHOT_RETRY')
  }
})
