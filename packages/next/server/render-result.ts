import type { ServerResponse } from 'http'

export default class RenderResult {
  _result: string | ReadableStream<Uint8Array>

  constructor(response: string | ReadableStream<Uint8Array>) {
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

    return (async () => {
      const reader = response.getReader()
      let fatalError = false

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            res.end()
            return
          }

          fatalError = true
          res.write(value)
          flush()
        }
      } catch (err) {
        if (fatalError) {
          res.destroy(err as any)
        }
        throw err
      }
    })()
  }

  isDynamic(): boolean {
    return typeof this._result !== 'string'
  }

  static fromStatic(value: string): RenderResult {
    return new RenderResult(value)
  }

  static empty = RenderResult.fromStatic('')
}
