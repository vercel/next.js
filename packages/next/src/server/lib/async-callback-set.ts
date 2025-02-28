export class AsyncCallbackSet {
  private callbacks: (() => Promise<void>)[] = []

  public add(callback: () => Promise<void>) {
    this.callbacks.push(callback)
  }

  public async runAll(): Promise<void> {
    if (!this.callbacks.length) {
      return
    }
    const callbacks = this.callbacks
    this.callbacks = []
    await Promise.allSettled(
      callbacks.map(
        // NOTE: wrapped in an async function to protect against synchronous exceptions
        async (f) => f()
      )
    )
  }
}
