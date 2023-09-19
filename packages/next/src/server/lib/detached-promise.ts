/**
 * A promise that can be resolved or rejected from the outside. This is useful
 * for control flow applications using promises.
 */
export class DetachedPromise<T = any> implements PromiseLike<T> {
  // We know that the callbacks are assigned in the constructor because the
  // function inside the promise constructor is evaluated synchronously.
  private callbacks!: {
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason: any) => void
  }

  // The actual promise used to implement the PromiseLike interface.
  private promise: Promise<T>

  constructor() {
    // Here, we create a promise, capture it's resolve and reject callbacks and
    // store them in the class instance. We then expose the promise to the
    // outside world.
    this.promise = new Promise<T>((resolve, reject) => {
      this.callbacks = { resolve, reject }
    })
  }

  /**
   * Implements the PromiseLike interface.
   *
   * @param onfulfilled The callback to be called when the promise is resolved.
   * @param onrejected The callback to be called when the promise is rejected.
   * @returns A promise that is resolved or rejected with the value or reason
   */
  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  /**
   * Resolves the promise with the given value.
   *
   * @param value the value to resolve the promise with
   */
  public resolve(value: T | PromiseLike<T>): void {
    this.callbacks.resolve(value)
  }

  /**
   * Rejects the promise with the given reason.
   *
   * @param reason the reason to reject the promise with
   */
  public reject(reason: any): void {
    this.callbacks.reject(reason)
  }
}
