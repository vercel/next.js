import { AsyncResource } from 'node:async_hooks'
import { test, expect, afterEach } from 'vitest'
import { firstAttempt, retryAttempt, teardown } from './subject'

const mode = process.env.NEXT_TEST_STAGE3_SCENARIO
let attempts = 0
afterEach(() => {
  expect(teardown()).toBe('teardown')
  if (mode === 'cleanup') throw new Error('EXPECTED_CLEANUP_FAILURE')
})
if (mode === 'nonzero') process.exitCode = 7

test(
  'worker lifecycle',
  { retry: mode === 'retry' ? 1 : 0, timeout: mode === 'timeout' ? 20 : 10000 },
  async () => {
    if (mode === 'timeout' || mode === 'cancel') await new Promise(() => {})
    if (++attempts === 1) expect(firstAttempt()).toBe('first')
    else expect(retryAttempt()).toBe('retry')
    if (mode === 'retry' && attempts === 1)
      throw new Error('EXPECTED_FIRST_RETRY_FAILURE')
    if (mode === 'failure') throw new Error('EXPECTED_ORDINARY_FAILURE')
    if (
      ['late', 'missing', 'duplicate', 'mismatch', 'unsolicited'].includes(mode)
    ) {
      const closedAttempt = AsyncResource.bind(() => {
        try {
          expect(true).toBe(true)
        } catch {}
      })
      const send = process.send
      process.send = function (message, ...args) {
        if (message.type !== 'complete')
          return send.call(this, message, ...args)
        if (mode === 'missing') delete message.coverage
        if (mode === 'mismatch')
          message.coverage.revision = 'incorrect-revision'
        if (mode === 'unsolicited')
          message.coverage = { version: 1, complete: true }
        if (mode === 'duplicate') {
          return send.call(this, message, () =>
            send.call(this, message, ...args)
          )
        }
        const result = send.call(this, message, ...args)
        if (mode === 'late') closedAttempt()
        return result
      }
    }
  }
)
