import type { Readable } from 'node:stream'
import { InvariantError } from '../../shared/lib/invariant-error'

export type StreamLike = ReadableStream<Uint8Array> | Readable

function isWebStream(stream: StreamLike): stream is ReadableStream<Uint8Array> {
  return typeof (stream as ReadableStream).tee === 'function'
}

// React's RSC prerender function will emit an incomplete flight stream when using `prerender`. If the connection
// closes then whatever hanging chunks exist will be errored. This is because prerender (an experimental feature)
// has not yet implemented a concept of resume. For now we will simulate a paused connection by wrapping the stream
// in one that doesn't close even when the underlying is complete.
export class ReactServerResult {
  private _stream: null | StreamLike

  constructor(stream: StreamLike) {
    this._stream = stream
  }

  tee(): StreamLike {
    if (this._stream === null) {
      throw new Error(
        'Cannot tee a ReactServerResult that has already been consumed'
      )
    }
    if (isWebStream(this._stream)) {
      const tee = this._stream.tee()
      this._stream = tee[0]
      return tee[1]
    }
    // Node.js Readable: pipe to two PassThrough streams
    const { PassThrough } =
      require('node:stream') as typeof import('node:stream')
    const pt1 = new PassThrough()
    const pt2 = new PassThrough()
    this._stream.pipe(pt1)
    this._stream.pipe(pt2)
    this._stream = pt1
    return pt2
  }

  consume(): StreamLike {
    if (this._stream === null) {
      throw new Error(
        'Cannot consume a ReactServerResult that has already been consumed'
      )
    }
    const stream = this._stream
    this._stream = null
    return stream
  }
}

export type ReactServerPrerenderResolveToType = {
  prelude: ReadableStream<Uint8Array>
}

export async function createReactServerPrerenderResult(
  underlying: Promise<ReactServerPrerenderResolveToType>
): Promise<ReactServerPrerenderResult> {
  const chunks: Array<Uint8Array> = []
  const { prelude } = await underlying
  const reader = prelude.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return new ReactServerPrerenderResult(chunks)
    } else {
      chunks.push(value)
    }
  }
}

export async function createReactServerPrerenderResultFromRender(
  underlying: StreamLike
): Promise<ReactServerPrerenderResult> {
  const chunks: Array<Uint8Array> = []

  if (isWebStream(underlying)) {
    const reader = underlying.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      } else {
        chunks.push(value)
      }
    }
  } else {
    // Node.js Readable stream
    const readable: Readable = underlying
    await new Promise<void>((resolve, reject) => {
      readable.on('data', (chunk: Buffer | Uint8Array) => {
        chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
      })
      readable.on('end', resolve)
      readable.on('error', reject)
    })
  }

  return new ReactServerPrerenderResult(chunks)
}
export class ReactServerPrerenderResult {
  private _chunks: null | Array<Uint8Array>

  private assertChunks(expression: string): Array<Uint8Array> {
    if (this._chunks === null) {
      throw new InvariantError(
        `Cannot \`${expression}\` on a ReactServerPrerenderResult that has already been consumed.`
      )
    }
    return this._chunks
  }

  private consumeChunks(expression: string): Array<Uint8Array> {
    const chunks = this.assertChunks(expression)
    this.consume()
    return chunks
  }

  consume(): void {
    this._chunks = null
  }

  constructor(chunks: Array<Uint8Array>) {
    this._chunks = chunks
  }

  asUnclosingStream(): ReadableStream<Uint8Array> {
    const chunks = this.assertChunks('asUnclosingStream()')
    return createUnclosingStream(chunks)
  }

  consumeAsUnclosingStream(): ReadableStream<Uint8Array> {
    const chunks = this.consumeChunks('consumeAsUnclosingStream()')
    return createUnclosingStream(chunks)
  }

  asStream(): ReadableStream<Uint8Array> {
    const chunks = this.assertChunks('asStream()')
    return createClosingStream(chunks)
  }

  consumeAsStream(): ReadableStream<Uint8Array> {
    const chunks = this.consumeChunks('consumeAsStream()')
    return createClosingStream(chunks)
  }
}

function createUnclosingStream(
  chunks: Array<Uint8Array>
): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    async pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++])
      }
      // we intentionally keep the stream open. The consumer will clear
      // out chunks once finished and the remaining memory will be GC'd
      // when this object goes out of scope
    },
  })
}

function createClosingStream(
  chunks: Array<Uint8Array>
): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    async pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++])
      } else {
        controller.close()
      }
    },
  })
}

export async function processPrelude(
  unprocessedPrelude: ReadableStream<Uint8Array>
) {
  const [prelude, peek] = unprocessedPrelude.tee()

  const reader = peek.getReader()
  const firstResult = await reader.read()
  reader.cancel()

  const preludeIsEmpty = firstResult.done === true

  return { prelude, preludeIsEmpty }
}
