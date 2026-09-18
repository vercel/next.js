import { AsyncResource } from 'node:async_hooks'
import { expect, it } from 'vitest'

const skip = it.skip
const extended = it.extend({ value: 42 })

// Instrumented terminal transport: retained declarations must report their
// originating closed scope without adding or changing already-sealed cases.
it('declaration origin', () => {
  const invoke = AsyncResource.bind(() => {
    for (const [name, declare] of [
      ['skip', skip],
      ['extended', extended],
    ]) {
      try {
        declare(`must not collect ${name}`, () => {})
      } catch (error) {
        console.log('L_LATE_DECLARATION_CAUGHT', name, error.message)
      }
    }
  })
  const send = process.send
  process.send = function (message, ...args) {
    const result = send.call(this, message, ...args)
    if (message.type === 'complete') {
      console.log('L_DECLARATION_TERMINAL_PAYLOAD', message.result.status)
      invoke()
    }
    return result
  }
  expect(true).toBe(true)
})
