/**
 * The Awaiter class is used to manage and await multiple promises.
 */
export class Awaiter {
  private promises: Set<Promise<unknown>> = new Set()
  private onError: ((error: unknown) => void) | undefined

  constructor({ onError }: { onError?: (error: unknown) => void } = {}) {
    this.onError = onError ?? console.error
  }

  public waitUntil = (promise: Promise<unknown>) => {
    this.promises.add(promise.catch(this.onError))
  }

  public async awaiting(): Promise<void> {
    while (this.promises.size > 0) {
      const promises = Array.from(this.promises)
      this.promises.clear()
      await Promise.all(promises)
    }
  }
}
