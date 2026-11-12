import { AsyncResource } from 'node:async_hooks'
import { expect, it } from 'vitest'
import { rsc } from 'next/dist/experimental/testing/rsc/index'

// Instrumented real-worker shutdown regression: the binding is already disposed
// when B publishes its terminal payload. No render/resource work may start.
it('closed render origin', () => {
  const options = new Proxy(
    {},
    {
      get() {
        console.log('L_UNEXPECTED_RENDER_OPTIONS')
        throw new Error('Closed render must not inspect resource options')
      },
    }
  )
  function UnexpectedComponent() {
    console.log('L_UNEXPECTED_RENDER_COMPONENT')
    throw new Error('Closed render must not execute a component')
  }
  const trigger = AsyncResource.bind(async () => {
    try {
      await rsc.render(UnexpectedComponent, {}, options)
    } catch (error) {
      console.log('L_LATE_RENDER_CAUGHT', error.message)
    }
  })
  const send = process.send
  process.send = function (message, ...args) {
    const result = send.call(this, message, ...args)
    if (message.type === 'complete') {
      console.log('L_RENDER_TERMINAL_PAYLOAD', message.result.status)
      void trigger()
    }
    return result
  }
  expect(true).toBe(true)
})
