import { AsyncResource } from 'node:async_hooks'
import { expect, test } from 'vitest'

test('snapshot', () => {
  const invokeClosedAttempt = AsyncResource.bind(() => {
    try {
      expect(true).toBe(true)
    } catch {}
  })
  const send = process.send
  process.send = function (message, ...args) {
    const result = send.call(this, message, ...args)
    if (message.type === 'complete') {
      console.log('SNAPSHOT_WORKER_STATUS=' + message.result.status)
      invokeClosedAttempt()
    }
    return result
  }
  expect('updated').toMatchSnapshot()
})
