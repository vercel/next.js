import { expect, test, vi } from 'vitest'

vi.mock('../dependency', async () => {
  globalThis.__lifecycleStarted()
  await globalThis.__lifecycleGate
  throw new Error('LIFECYCLE_LATE_FACTORY_REJECTION')
})

test('a caught factory rejection after disposal still fails its owning file', async () => {
  const started = new Promise((resolve) => {
    globalThis.__lifecycleStarted = resolve
  })
  globalThis.__lifecycleGate = new Promise((resolve) => {
    globalThis.__lifecycleRelease = resolve
  })
  // This is a real compiler-resolved dynamic import. Catching its rejection
  // makes the disposed registry callback responsible for failing the worker.
  const pending = import('../dependency').then(
    () => {
      throw new Error('The late mock factory unexpectedly resolved')
    },
    (error) => {
      process.stdout.write(
        'LIFECYCLE_CAUGHT=' +
          JSON.stringify({
            message: error.message,
            cause: error.cause?.message,
          }) +
          '\n'
      )
    }
  )
  await started
  expect(typeof globalThis.__lifecycleRelease).toBe('function')
  const send = process.send
  // Controlled internal transport probe: release the actual factory only after
  // the worker has disposed file resources and prepared its terminal payload.
  process.send = function (message, ...args) {
    if (message.type !== 'complete') return send.call(this, message, ...args)
    process.stdout.write(
      'LIFECYCLE_PROVISIONAL=' +
        JSON.stringify({ status: message.result.status, pid: process.pid }) +
        '\n'
    )
    globalThis.__lifecycleRelease()
    pending.then(
      () => send.call(this, message, ...args),
      (error) => {
        console.error(error)
        process.exit(92)
      }
    )
    return true
  }
})
