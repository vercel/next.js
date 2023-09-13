type PromiseCallbacks<T = any> = {
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason: any) => void
}

export class DetachedPromise<T = any> {
  private callbacks!: PromiseCallbacks<T>
  private promise: Promise<T>

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.callbacks = { resolve, reject }
    })
  }

  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1) | undefined | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  public resolve(value: T | PromiseLike<T>): void {
    this.callbacks.resolve(value)
  }

  public reject(reason: any): void {
    this.callbacks.reject(reason)
  }
}
