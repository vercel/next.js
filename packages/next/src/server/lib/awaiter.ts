import { InvariantError } from '../../shared/lib/invariant-error'

/**
 * Provides a `waitUntil` implementation which gathers promises to be awaited later (via {@link AwaiterMulti.awaiting}).
 * Unlike a simple `Promise.all`, {@link AwaiterMulti} works recursively --
 * if a promise passed to {@link AwaiterMulti.waitUntil} calls `waitUntil` again,
 * that second promise will also be awaited.
 */
export class AwaiterMulti {
  private promises: Set<Promise<unknown>> = new Set()
  private onError: (error: unknown) => void

  constructor({ onError }: { onError?: (error: unknown) => void } = {}) {
    this.onError = onError ?? console.error
  }

  public waitUntil = (promise: Promise<unknown>): void => {
    // if a promise settles before we await it, we can drop it.
    const cleanup = () => {
      this.promises.delete(promise)
    }

    this.promises.add(
      promise.then(cleanup, (err) => {
        cleanup()
        this.onError(err)
      })
    )
  }

  public async awaiting(): Promise<void> {
    while (this.promises.size > 0) {
      const promises = Array.from(this.promises)
      this.promises.clear()
      await Promise.all(promises)
    }
  }
}

/**
 * Like {@link AwaiterMulti}, but can only be awaited once.
 * If {@link AwaiterOnce.waitUntil} is called after that, it will throw.
 */
export class AwaiterOnce {
  private awaiter: AwaiterMulti
  private done: boolean = false
  private pending: Promise<void> | undefined

  constructor(options: { onError?: (error: unknown) => void } = {}) {
    this.awaiter = new AwaiterMulti(options)
  }

  public waitUntil = (promise: Promise<unknown>): void => {
    if (this.done) {
      throw new InvariantError(
        'Cannot call waitUntil() on an AwaiterOnce that was already awaited'
      )
    }
    return this.awaiter.waitUntil(promise)
  }

  public async awaiting(): Promise<void> {
    if (!this.pending) {
      this.pending = this.awaiter.awaiting().finally(() => {
        this.done = true
      })
    }
    return this.pending
  }
}
