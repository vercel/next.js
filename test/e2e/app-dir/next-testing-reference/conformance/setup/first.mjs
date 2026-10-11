import { beforeEach } from 'vitest'
import { sum } from '../../lib/subject'
import { state } from './state.mjs'

if (state.events.length !== 0 || state.cleanups !== 0 || state.cases !== 0) {
  throw new Error('L_SETUP_FILE_STATE_LEAKED')
}
state.events.push('setup:first:start')
await Promise.resolve()
state.sum = sum([2, 3, 5])
state.events.push('setup:first:ready')

beforeEach(async () => {
  await Promise.resolve()
  state.events.push('hook:first')
  return () => {
    state.cleanups++
    state.events.push('cleanup:first')
  }
})
