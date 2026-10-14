import { expect, it } from 'vitest'

let attempt = 0
it.skip('skipped', () => expect('changed skipped').toMatchSnapshot())
it('selected', { retry: 1 }, () => {
  if (attempt++ === 0) {
    expect('failed value').toMatchSnapshot()
    throw new Error('L_EXPECTED_SNAPSHOT_RETRY')
  }
})
