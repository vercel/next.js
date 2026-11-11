import { state } from '../lib/state'
await Promise.resolve()
if (state.order.join(',') !== 'first:start,first:end') {
  throw new Error('failure setup did not share first setup state')
}
throw new Error('intentional asynchronous setup rejection')
