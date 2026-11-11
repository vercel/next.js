import { state } from './state.mjs'

if (state.sum !== 10 || state.events.at(-1) !== 'setup:first:ready') {
  throw new Error('L_SETUP_REJECTION_ORDER_INCORRECT')
}
console.log('L_SETUP_REJECTION_REACHED')
await Promise.resolve()
throw new Error('L_EXPECTED_ASYNC_SETUP_FAILURE')
