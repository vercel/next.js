import { DetachedPromise } from './detached-promise'
import { timeOutAfter } from './time-out-after'

export class Waiter {
  private isDone = false
  private readonly signal = new DetachedPromise<void>()

  constructor(private readonly errorMessage: string) {}

  /**
   * Signals that the work is done.
   */
  public done() {
    this.isDone = true
    this.signal.resolve()
  }

  /**
   * This will wait for the waiter to be done or the timeout value to be
   * reached, which ever comes first.
   *
   * @param ms the amount of milliseconds to wait for the promise
   * @returns a promise that resolves when the work is done
   */
  public async wait(ms: number): Promise<void> {
    // If we're already done, return now.
    if (this.isDone) return

    return timeOutAfter(this.signal.promise, {
      timeoutAfterMs: ms,
      // We use this callback to decorate the error with the provided message.
      onTimeout: (err) => {
        throw new Error(this.errorMessage, { cause: err })
      },
    })
  }
}
