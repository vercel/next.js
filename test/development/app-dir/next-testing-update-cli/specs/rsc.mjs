import 'server-only'
import { expect, test } from 'vitest'

test('selected snapshot', () => {
  expect('updated').toMatchSnapshot()
  if (process.env.NEXT_TEST_UPDATE_FAIL === '1')
    throw new Error('Failure after staged snapshot')
})

test.skip('skipped snapshot', () => expect('ignored').toMatchSnapshot())
