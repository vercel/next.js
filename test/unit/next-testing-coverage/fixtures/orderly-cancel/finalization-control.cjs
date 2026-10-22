// Faults at the actual file-worker transport retain real execution and capture.
const mode = process.env.NEXT_TEST_FINALIZATION_CONTROL
const originalSend = process.send
const seal = (completion) => ({
  type: 'user-cancellation-finalized',
  version: 1,
  runId: completion.coverage.runId,
  entryId: completion.coverage.entryId,
  revision: completion.coverage.revision,
})

process.send = function (message, ...args) {
  if (message.type === 'complete') {
    if (mode === 'early-seal') originalSend.call(this, seal(message))
    if (mode === 'spontaneous-signal') {
      process.kill(process.pid, 'SIGTERM')
      return true
    }
    if (mode === 'late-rejection' && typeof args.at(-1) === 'function') {
      const callback = args.at(-1)
      args[args.length - 1] = (...values) => {
        Promise.reject(
          new Error('Actual rejection after provisional completion')
        )
        setImmediate(() => callback(...values))
      }
    }
  }
  if (message.type === 'user-cancellation-finalized') {
    if (mode === 'foreign-seal') message.revision = 'foreign-finalization'
    if (mode === 'duplicate-seal') originalSend.call(this, message)
    if (mode === 'nonzero-exit') process.exit(1)
    if (mode === 'before-seal-rejection') {
      Promise.reject(new Error('Actual rejection while awaiting parent stop'))
      setImmediate(() => Reflect.apply(originalSend, this, [message, ...args]))
      return true
    }
  }
  return Reflect.apply(originalSend, this, [message, ...args])
}
