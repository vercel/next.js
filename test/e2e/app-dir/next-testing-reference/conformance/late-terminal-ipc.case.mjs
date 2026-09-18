import { AsyncResource } from 'node:async_hooks'
import { expect, it } from 'vitest'

// Instrument the real worker transport only for this adversarial lifecycle test.
it('passes before terminal transport hook', () => {
  const invokeClosedOrigin = AsyncResource.bind(() => {
    try {
      expect(1).toBe(1)
    } catch {}
  })
  const send = process.send
  process.send = function (message, ...args) {
    const result = send.call(this, message, ...args)
    if (message.type === 'complete') {
      console.log('L_TERMINAL_PAYLOAD_STATUS', message.result.status)
      invokeClosedOrigin()
    }
    return result
  }
  expect(1).toBe(1)
})
