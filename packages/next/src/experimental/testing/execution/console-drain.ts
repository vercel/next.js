/** Await real console callback delivery without retaining an aborted file. */
export async function drainConsoleCallbacks(
  operation: (() => Promise<void>) | undefined,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted()
  if (!operation) return
  let abort!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    // Promise.race keeps a rejection observer on the real pending callback after
    // cancellation. Its reporter owner retains that callback's actual failure.
    await Promise.race([operation(), cancelled])
  } finally {
    void cancelled.catch(() => {})
    signal.removeEventListener('abort', abort)
  }
}
