import type { ServerResponse } from 'http'

export type ResultPiper = (
  push: (chunks: Uint8Array[]) => void,
  next: (err?: Error) => void
) => void

export default class RenderResult {
  _result: string | ResultPiper

  constructor(response: string | ResultPiper) {
    this._result = response
  }

  toUnchunkedString(): string {
    if (typeof this._result !== 'string') {
      throw new Error(
        'invariant: dynamic responses cannot be unchunked. This is a bug in Next.js'
      )
    }
    return this._result
  }

  pipe(res: ServerResponse): Promise<void> {
    if (typeof this._result === 'string') {
      throw new Error(
        'invariant: static responses cannot be piped. This is a bug in Next.js'
      )
    }
    const response = this._result
    const flush =
      typeof (res as any).flush === 'function'
        ? () => (res as any).flush()
        : () => {}

    return new Promise((resolve, reject) => {
      let fatalError = false
      response(
        (chunks) => {
          // The state of the stream is non-deterministic after
          // writing, so any error becomes fatal.
          fatalError = true
          res.cork()
          chunks.forEach((chunk) => res.write(chunk))
          res.uncork()
          flush()
        },
        (err) => {
          if (err) {
            if (fatalError) {
              res.destroy(err)
            }
            reject(err)
          } else {
            res.end()
            resolve()
          }
        }
      )
    })
  }

  isDynamic(): boolean {
    return typeof this._result !== 'string'
  }

  static fromStatic(value: string): RenderResult {
    return new RenderResult(value)
  }

  static empty = RenderResult.fromStatic('')
}
