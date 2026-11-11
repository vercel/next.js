import { beforeEach } from 'vitest'
import { state, subject } from '../lib/state'

if (state.order.join(',') !== 'first:start,first:end') {
  throw new Error('second setup ran before first setup completed')
}
if (subject.read() !== 'setup') throw new Error('setup module identity differs')
state.order.push('second')
beforeEach(() => {
  state.order.push('second:hook')
  return () => state.order.push('second:cleanup')
})
