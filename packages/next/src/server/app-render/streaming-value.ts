import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

export class StreamingValue<T> implements AsyncIterable<T> {
  private _next: PromiseWithResolvers<IteratorResult<T>> | null = null

  private _done = false
  private _buffer: T[] = []

  emit(value: T): void {
    if (this._done) {
      return
    }
    if (this._next !== null) {
      this._next.resolve({ value, done: false })
      this._next = null
    } else {
      this._buffer.push(value)
    }
  }

  close(): void {
    if (this._done) {
      return
    }
    this._done = true
    if (this._next !== null) {
      this._next.resolve({ value: undefined, done: true })
      this._next = null
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this._buffer.length > 0) {
          return Promise.resolve({ value: this._buffer.shift()!, done: false })
        }
        if (this._done) {
          return Promise.resolve({ value: undefined, done: true })
        }
        this._next = createPromiseWithResolvers()
        return this._next.promise
      },
      // throw: (err: unknown) => {
      //   this._done = true
      //   this._buffer.length = 0
      //   const next = this._next
      //   if (next !== null) {
      //     next.promise.catch(ignoreReject)
      //     return next.reject(err)
      //   } else {
      //     const promise = Promise.reject(err)
      //     promise.catch(ignoreReject)
      //     return promise
      //   }
      // },
    }
  }
}

// function ignoreReject() {}
