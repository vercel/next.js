/**
 * A `Promise.withResolvers` implementation that exposes the `resolve` and
 * `reject` functions on a `Promise`.
 *
 * @see https://tc39.es/proposal-promise-with-resolvers/
 */
export class DetachedPromise<T = any> {
  public readonly resolve: (value: T | PromiseLike<T>) => void
  public readonly reject: (reason: any) => void
  public readonly promise: Promise<T>

  constructor() {
    let resolve: (value: T | PromiseLike<T>) => void
    let reject: (reason: any) => void

    // Create the promise and assign the resolvers to the object.
    this.promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    // We know that resolvers is defined because the Promise constructor runs
    // synchronously.
    this.resolve = resolve!
    this.reject = reject!
  }
}
