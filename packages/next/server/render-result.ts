import type { ServerResponse } from 'http'
import { pipeToNodeWritable, pipeToReadableStream, Stream } from './stream'

export default class RenderResult {
  _result: string | Stream

  constructor(response: string | Stream) {
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
    return pipeToNodeWritable(this._result, res)
  }

  pipeToWritableStreamDefaultWriter(writer: WritableStreamDefaultWriter): void {
    if (typeof this._result === 'string') {
      throw new Error(
        'invariant: static responses cannot be piped. This is a bug in Next.js'
      )
    }
    return pipeToReadableStream(this._result, writer)
  }

  isDynamic(): boolean {
    return typeof this._result !== 'string'
  }

  static fromStatic(value: string): RenderResult {
    return new RenderResult(value)
  }

  static empty = RenderResult.fromStatic('')
}
