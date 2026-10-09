import { beforeEach } from 'vitest'
import { state } from './state.mjs'

if (
  JSON.stringify(state.events) !==
  JSON.stringify(['setup:first:start', 'setup:first:ready'])
) {
  throw new Error('L_SETUP_ORDER_OR_ASYNC_COMPLETION')
}
state.events.push('setup:second')

beforeEach(() => {
  state.events.push('hook:second')
  return () => {
    state.cleanups++
    state.events.push('cleanup:second')
  }
})
