/** The actual physical owner attests this boundary after ordinary close. */
export interface CustomReporterFinalExit {
  teardownTimeout: number
  reportProcessTimeout(): Promise<void>
}

/** Allow real retained work to keep the realm alive until its exit deadline. */
export function finishCustomReporterProcess(exit: CustomReporterFinalExit) {
  const timeout = setTimeout(() => {
    // Callback completion precedes the warning and exit. An authored rejection
    // retains Node's native semantics at this final physical boundary.
    void exit.reportProcessTimeout().then(() => {
      console.warn(`close timed out after ${exit.teardownTimeout}ms`)
      process.exit(process.exitCode ?? 0)
    })
  }, exit.teardownTimeout)
  timeout.unref()
  // Keep a real cancellation path while authored work remains, without the
  // transport itself retaining an otherwise healthy process.
  process.on('message', (message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'cancel'
    )
      process.exit(1)
  })
  process.once('disconnect', () => process.exit(1))
  process.channel?.unref()
}
