import { createCustomReporterRuntime } from './custom-reporter-runtime'
import { finishCustomReporterProcess } from './custom-reporter-exit'

const runtime = createCustomReporterRuntime({
  send(message) {
    return new Promise<void>((resolve, reject) =>
      process.send!(message, (error: Error | null) =>
        error ? reject(error) : resolve()
      )
    )
  },
  closeTransport(code) {
    const closeFailure = runtime.initialCloseFailure()
    if (code === 1 && closeFailure === 'sync') {
      process.exitCode ??= 1
      process.exit()
    }
    const exit =
      code === 0 || closeFailure === 'async' ? runtime.finalExit() : undefined
    if (!exit) {
      process.exit(code)
    }
    process.removeListener('message', runtime.receive)
    process.removeListener('disconnect', runtime.disconnect)
    process.removeListener('unhandledRejection', runtime.unhandledRejection)
    finishCustomReporterProcess(exit)
  },
})

process.on('message', runtime.receive)
process.once('disconnect', runtime.disconnect)
process.on('unhandledRejection', runtime.unhandledRejection)
