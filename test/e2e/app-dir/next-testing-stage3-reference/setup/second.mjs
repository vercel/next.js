import { state } from '../lib/state'
if (state.setup.join(',') !== 'first-start,first-end')
  throw new Error('First async setup did not finish before second setup')
state.setup.push('second')
