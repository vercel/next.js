import { beforeEach, expect, vi } from 'vitest'
import { state, subject } from '../lib/state'

if (state.order.length !== 0)
  throw new Error('setup state crossed a file boundary')
state.order.push('first:start')
await Promise.resolve()
vi.spyOn(subject, 'read').mockReturnValue('setup')
expect.extend({
  toBeSetupValue(actual) {
    return { pass: actual === 'setup', message: () => 'expected setup value' }
  },
})
beforeEach(() => {
  state.order.push('first:hook')
  return () => state.order.push('first:cleanup')
})
state.order.push('first:end')

// Audit the actual runner disposal before the real worker exits, including a
// collection failure. This does not supply or replace any runtime resource.
const exit = process.exit.bind(process)
process.exit = (code) => {
  console.log('SETUP_DISPOSAL=' + subject.read())
  return exit(subject.read() === 'original' ? code : 99)
}
