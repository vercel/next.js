import { DetachedPromise } from './detached-promise'
import { TimeOutError, timeOutAfter } from './time-out-after'

export class Waiter {
  private isWaiting = false
  private readonly signal = new DetachedPromise<void>()

  constructor(private readonly errorMessage: string) {}

  /**
   * Signals that the work is done.
   */
  public done() {
    this.signal.resolve()
  }

  /**
   * This will wait for the waiter to be done or the timeout value to be
   * reached, which ever comes first. This will only wait once, subsequent
   * calls will return the same promise that will be resolved/rejected.
   *
   * @param ms the amount of milliseconds to wait for the promise
   * @returns a promise that resolves when the work is done
   */
  public async wait(ms: number): Promise<void> {
    // If we're already done, return now.
    if (this.isWaiting) return this.signal.promise
    this.isWaiting = true

    // Otherwise, wait for the timeout to be reached or the promise to resolve.
    // Only the first call to `.resolve()/.reject()` will be counted.
    timeOutAfter(this.signal.promise, {
      timeoutAfterMs: ms,
      // We use this callback to decorate the error with the provided message.
      onTimeout: (err) => {
        throw new TimeOutError(this.errorMessage, { cause: err })
      },
    }).catch((err) => {
      // Reject the promise, so that in the future, the caller can
      this.signal.reject(err)
    })

    return this.signal.promise
  }
}
