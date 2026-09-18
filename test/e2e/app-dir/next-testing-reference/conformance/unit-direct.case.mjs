import { it } from 'vitest'
import { sum } from '../lib/subject.ts'
import { serverMessage } from '../lib/server-message.ts'

it('executes the ordinary application subject in the RSC compilation context', () => {
  if (sum([2, 3, 5]) !== 10 || sum([]) !== 0) {
    throw new Error('The compiled ordinary subject returned an incorrect sum')
  }
})

it('resolves and executes a server-only dependency', async () => {
  if ((await serverMessage()) !== 'server sum: 10') {
    throw new Error(
      'The compiled server-only dependency returned an incorrect message'
    )
  }
})
