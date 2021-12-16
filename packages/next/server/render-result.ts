import type { ServerResponse } from 'http'
import type { Writable } from 'stream'

export type NodeWritablePiper = (
  res: Writable,
  next: (err?: Error) => void
) => void

export default class RenderResult {
  _result: string | NodeWritablePiper

  constructor(response: string | NodeWritablePiper) {
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
    return new Promise((resolve, reject) => {
      response(res, (err) => (err ? reject(err) : resolve()))
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
