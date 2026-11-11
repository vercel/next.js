// Plain process ownership fixture. This loads no Next.js or checker code.
let started = false

process.on('message', (message) => {
  if (message?.type === 'cancel') {
    process.exitCode = 1
    process.disconnect()
    return
  }
  if (message?.type === 'run' && !started) {
    started = true
    process.send({ type: 'body-held', pid: process.pid })
    return
  }
  if (message?.type === 'finish' && started) {
    process.send({ type: 'body-finished' }, () => process.disconnect())
    return
  }
  process.exitCode = 1
  process.disconnect()
})
