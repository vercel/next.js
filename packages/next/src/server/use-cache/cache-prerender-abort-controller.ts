/**
 * Provides an abort signal for a single cache prerender without using
 * `AbortSignal.any()`. Node keeps non-empty composite signals alive while they
 * have abort listeners, and React attaches one for the duration of a prerender.
 */
export class CachePrerenderAbortController implements EventListenerObject {
  private readonly controller: AbortController
  private readonly dynamicAccessSignal: AbortSignal | undefined
  private readonly timeoutSignal: AbortSignal
  readonly signal: AbortSignal

  constructor(
    dynamicAccessSignal: AbortSignal | undefined,
    timeoutSignal: AbortSignal
  ) {
    const controller = new AbortController()

    this.controller = controller
    this.dynamicAccessSignal = dynamicAccessSignal
    this.timeoutSignal = timeoutSignal
    this.signal = controller.signal

    // Keep the same priority as the previous AbortSignal.any() call when both
    // sources are already aborted.
    if (dynamicAccessSignal) {
      this.listen(dynamicAccessSignal)
    }
    if (!this.signal.aborted) {
      this.listen(timeoutSignal)
    }

    if (this.signal.aborted) {
      this.dispose()
    }
  }

  private listen(signal: AbortSignal): void {
    if (signal.aborted) {
      this.controller.abort(signal.reason)
    } else {
      signal.addEventListener('abort', this, { once: true })
    }
  }

  handleEvent(event: Event): void {
    const sourceSignal = event.currentTarget as AbortSignal
    const reason = sourceSignal.reason

    this.dispose()
    this.controller.abort(reason)
  }

  dispose(): void {
    this.dynamicAccessSignal?.removeEventListener('abort', this)
    this.timeoutSignal.removeEventListener('abort', this)
  }
}
