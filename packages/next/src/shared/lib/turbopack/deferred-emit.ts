/**
 * Fires a callback after a delay unless it's cancelled or flushed first.
 *
 * `schedule()` replaces any still-pending emit.
 */
export class DeferredEmit {
  #timer: ReturnType<typeof setTimeout> | undefined
  #fn: (() => void) | undefined

  /**
   * Arm `fn` to run after `delayMs`, replacing any still-pending emit.
   *
   * @param delayMs The delay in milliseconds before the callback is fired.
   * @param fn The callback function to be executed after the delay.
   */
  schedule(delayMs: number, scheduledFn: () => void): void {
    this.cancel()
    this.#fn = scheduledFn
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      const fn = this.#fn
      this.#fn = undefined
      fn?.()
    }, delayMs)
  }

  /**
   * If an emit is pending, run it now instead of waiting for the delay.
   */
  flush(): void {
    if (this.#timer === undefined) {
      return
    }
    clearTimeout(this.#timer)
    this.#timer = undefined
    const fn = this.#fn
    this.#fn = undefined
    fn?.()
  }

  /**
   * Cancel a pending emit without running it.
   */
  cancel(): void {
    if (this.#timer === undefined) {
      return
    }
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#fn = undefined
  }

  get isPending(): boolean {
    return this.#timer !== undefined
  }
}
