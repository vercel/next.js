import { test, vi } from 'vitest'
import { value } from '../dependency'

vi.mock('../dependency', async () => {
  globalThis.__lifecycleDirty = true
  globalThis.process.stdout.write(
    'LIFECYCLE_FAILED_PID=' + globalThis.process.pid + '\n'
  )
  await Promise.resolve()
  throw new Error('LIFECYCLE_ASYNC_FACTORY_REJECTION')
})

test('must not collect after async factory failure', () => {
  throw new Error('Unexpected collection with value: ' + value)
})
