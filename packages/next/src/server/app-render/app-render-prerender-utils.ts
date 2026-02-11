import type { Readable as NodeReadable } from 'node:stream'
import { InvariantError } from '../../shared/lib/invariant-error'
import { teeNodeReadable } from './node-stream-tee'

// React's RSC prerender function will emit an incomplete flight stream when using `prerender`. If the connection
// closes then whatever hanging chunks exist will be errored. This is because prerender (an experimental feature)
// has not yet implemented a concept of resume. For now we will simulate a paused connection by wrapping the stream
// in one that doesn't close even when the underlying is complete.
export class ReactServerResult {
  private _stream: null | ReadableStream<Uint8Array> | NodeReadable
  private readonly _runInContext: <T>(fn: () => T) => T

  constructor(
    stream: ReadableStream<Uint8Array> | NodeReadable,
    runInContext?: <T>(fn: () => T) => T
  ) {
    this._stream = stream
    this._runInContext = runInContext ?? ((fn) => fn())
  }

  tee(): ReadableStream<Uint8Array> | NodeReadable {
    if (this._stream === null) {
      throw new Error(
        'Cannot tee a ReactServerResult that has already been consumed'
      )
    }
    if (this._stream instanceof ReadableStream) {
      const tee = this._stream.tee()
      this._stream = tee[0]
      return tee[1]
    } else if (process.env.NEXT_RUNTIME !== 'edge') {
      // Node tee callback handlers run on event boundaries, so keep request ALS
      // context stable for whichever branch is consumed later.
      const [primary, secondary] = teeNodeReadable(
        this._stream as NodeReadable,
        this._runInContext
      )
      this._stream = primary
      return secondary
    } else {
      throw new Error('Cannot tee a Node.js stream in the edge runtime')
    }
  }

  consume(): ReadableStream<Uint8Array> | NodeReadable {
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

export type ReactServerPrerenderNodeResolveToType = {
  prelude: NodeReadable
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

export async function createReactServerPrerenderResultFromNodeStream(
  underlying: Promise<ReactServerPrerenderNodeResolveToType>
): Promise<ReactServerPrerenderResult> {
  const chunks: Array<Uint8Array> = []
  const { prelude } = await underlying
  for await (const chunk of prelude) {
    chunks.push(
      Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : (chunk as Uint8Array)
    )
  }
  return new ReactServerPrerenderResult(chunks)
}

/**
 * Compile-time unified factory: creates a ReactServerPrerenderResult from a
 * prerender promise that resolves to { prelude }, using either the web or node
 * stream consumer based on __NEXT_USE_NODE_STREAMS.
 */
export async function createReactServerPrerenderResultFromPrerender(
  underlying: Promise<{ prelude: ReadableStream<Uint8Array> | NodeReadable }>
): Promise<ReactServerPrerenderResult> {
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    return createReactServerPrerenderResultFromNodeStream(
      underlying as Promise<ReactServerPrerenderNodeResolveToType>
    )
  }
  return createReactServerPrerenderResult(
    underlying as Promise<ReactServerPrerenderResolveToType>
  )
}

export async function createReactServerPrerenderResultFromRender(
  underlying: ReadableStream<Uint8Array> | NodeReadable
): Promise<ReactServerPrerenderResult> {
  const chunks: Array<Uint8Array> = []
  if (underlying instanceof ReadableStream) {
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
    // Node.js Readable
    for await (const chunk of underlying) {
      chunks.push(
        Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : (chunk as Uint8Array)
      )
    }
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

  asNodeStream(): NodeReadable {
    const chunks = this.assertChunks('asNodeStream()')
    return createClosingNodeStream(chunks)
  }

  consumeAsNodeStream(): NodeReadable {
    const chunks = this.consumeChunks('consumeAsNodeStream()')
    return createClosingNodeStream(chunks)
  }

  asUnclosingNodeStream(): NodeReadable {
    const chunks = this.assertChunks('asUnclosingNodeStream()')
    return createUnclosingNodeStream(chunks)
  }

  consumeAsUnclosingNodeStream(): NodeReadable {
    const chunks = this.consumeChunks('consumeAsUnclosingNodeStream()')
    return createUnclosingNodeStream(chunks)
  }

  // Compile-time unified methods: use __NEXT_USE_NODE_STREAMS to pick
  // the right stream type without branching at the call site.

  asFlightStream(): ReadableStream<Uint8Array> | NodeReadable {
    return process.env.__NEXT_USE_NODE_STREAMS
      ? this.asNodeStream()
      : this.asStream()
  }

  consumeAsFlightStream(): ReadableStream<Uint8Array> | NodeReadable {
    return process.env.__NEXT_USE_NODE_STREAMS
      ? this.consumeAsNodeStream()
      : this.consumeAsStream()
  }

  asUnclosingFlightStream(): ReadableStream<Uint8Array> | NodeReadable {
    return process.env.__NEXT_USE_NODE_STREAMS
      ? this.asUnclosingNodeStream()
      : this.asUnclosingStream()
  }

  consumeAsUnclosingFlightStream(): ReadableStream<Uint8Array> | NodeReadable {
    return process.env.__NEXT_USE_NODE_STREAMS
      ? this.consumeAsUnclosingNodeStream()
      : this.consumeAsUnclosingStream()
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

function createClosingNodeStream(chunks: Array<Uint8Array>): NodeReadable {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('createClosingNodeStream is not supported in edge runtime')
  } else {
    const { PassThrough } =
      require('node:stream') as typeof import('node:stream')
    const pt = new PassThrough()
    for (const chunk of chunks) {
      pt.write(chunk)
    }
    pt.end()
    return pt
  }
}

function createUnclosingNodeStream(chunks: Array<Uint8Array>): NodeReadable {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error(
      'createUnclosingNodeStream is not supported in edge runtime'
    )
  } else {
    const { PassThrough } =
      require('node:stream') as typeof import('node:stream')
    const pt = new PassThrough()
    for (const chunk of chunks) {
      pt.write(chunk)
    }
    // intentionally do not end the stream
    return pt
  }
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

export async function processNodePrelude(unprocessedPrelude: NodeReadable) {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('processNodePrelude is not supported in edge runtime')
  } else {
    const [prelude, peek] = teeNodeReadable(unprocessedPrelude)

    // Read the first chunk from the peek stream to check if it's empty
    const firstChunk = await new Promise<Uint8Array | null>(
      (resolve, reject) => {
        peek.once('data', (chunk) => {
          peek.destroy()
          resolve(chunk)
        })
        peek.once('end', () => {
          resolve(null)
        })
        peek.once('error', (err) => {
          if (!prelude.destroyed) prelude.destroy(err)
          reject(err)
        })
      }
    )

    const preludeIsEmpty = firstChunk === null

    return { prelude, preludeIsEmpty }
  }
}
