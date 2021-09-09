import { ServerResponse } from 'http'
import Observable from 'next/dist/compiled/zen-observable'

export default class RenderResult {
  _response: string | Observable<string>

  constructor(response: string | Observable<string>) {
    this._response = response
  }

  toUnchunkedString(): string {
    if (typeof this._response !== 'string') {
      throw new Error(
        'invariant: dynamic responses cannot be unchunked. This is a bug in Next.js'
      )
    }
    return this._response
  }

  async pipe(res: ServerResponse): Promise<void> {
    if (typeof this._response === 'string') {
      throw new Error(
        'invariant: static responses cannot be piped. This is a bug in Next.js'
      )
    }
    const maybeFlush =
      typeof (res as any).flush === 'function'
        ? () => (res as any).flush()
        : () => {}
    await this._response.forEach((chunk) => {
      res.write(chunk)
      maybeFlush()
    })
    res.end()
  }

  isDynamic(): boolean {
    return typeof this._response !== 'string'
  }

  static fromStatic(value: string): RenderResult {
    return new RenderResult(value)
  }

  static empty = RenderResult.fromStatic('')
}
