import type { Readable } from 'node:stream'
import { InvariantError } from '../../shared/lib/invariant-error'

export type AnyStream = ReadableStream<Uint8Array> | Readable
export type StreamCompletion = { error: unknown }
type OnStreamComplete = (completion?: StreamCompletion) => void

function isWebStream(stream: AnyStream): stream is ReadableStream<Uint8Array> {
  return typeof (stream as ReadableStream).tee === 'function'
}

// React's RSC prerender function will emit an incomplete flight stream when using `prerender`. If the connection
// closes then whatever hanging chunks exist will be errored. This is because prerender (an experimental feature)
// has not yet implemented a concept of resume. For now we will simulate a paused connection by wrapping the stream
// in one that doesn't close even when the underlying is complete.
export class ReactServerResult {
  private _stream: null | AnyStream
  private _replayable: ReplayableNodeStream | null

  constructor(stream: AnyStream) {
    if (process.env.__NEXT_USE_NODE_STREAMS && !isWebStream(stream)) {
      this._stream = null
      this._replayable = new ReplayableNodeStream(stream as Readable)
    } else {
      this._stream = stream
      this._replayable = null
    }
  }

  tee(): AnyStream {
    if (this._replayable) {
      return this._replayable.createReplayStream()
    }

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

    if (process.env.NEXT_RUNTIME === 'edge') {
      throw new InvariantError(
        'Node.js Readable cannot be teed in the edge runtime'
      )
    } else {
      let Readable: typeof import('node:stream').Readable
      if (process.env.TURBOPACK) {
        Readable = (require('node:stream') as typeof import('node:stream'))
          .Readable
      } else {
        Readable = (
          __non_webpack_require__('node:stream') as typeof import('node:stream')
        ).Readable
      }
      const webStream = Readable.toWeb(
        this._stream
      ) as ReadableStream<Uint8Array>
      const tee = webStream.tee()
      this._stream = Readable.fromWeb(
        tee[0] as import('stream/web').ReadableStream
      )
      return Readable.fromWeb(tee[1] as import('stream/web').ReadableStream)
    }
  }

  consume(): AnyStream {
    if (this._replayable) {
      const stream = this._replayable.createReplayStream()
      this._replayable.dispose()
      this._replayable = null
      return stream
    }

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

type ReplayableStreamSubscriber = {
  onChunk: (chunk: Uint8Array) => void
  onEnd: () => void
  onError: (err: Error) => void
}

/**
 * Buffers all chunks from a Node.js Readable stream and allows creating new
 * Readable streams that replay the buffered chunks plus any subsequent chunks
 * from the source. Multiple replay streams can be created independently.
 */
export class ReplayableNodeStream {
  private _chunks: Array<Uint8Array> | null
  private _done: boolean
  private _error: Error | null
  private _subscribers: Set<ReplayableStreamSubscriber>

  constructor(stream: Readable) {
    this._chunks = []
    this._done = false
    this._error = null
    this._subscribers = new Set()

    stream.on('data', (chunk: Buffer | Uint8Array) => {
      const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
      if (this._chunks !== null) {
        this._chunks.push(buf)
      }
      for (const sub of this._subscribers) {
        sub.onChunk(buf)
      }
    })

    stream.on('end', () => {
      this._done = true
      for (const sub of this._subscribers) {
        sub.onEnd()
      }
      this._subscribers.clear()
    })

    stream.on('error', (err: Error) => {
      this._error = err
      for (const sub of this._subscribers) {
        sub.onError(err)
      }
      this._subscribers.clear()
    })

    stream.on('close', () => {
      if (!this._done && !this._error) {
        const error = createPrematureStreamCloseError('RSC')
        this._error = error
        for (const sub of this._subscribers) {
          sub.onError(error)
        }
        this._subscribers.clear()
      }
    })
  }

  /**
   * Creates a new Node.js Readable stream that first emits all buffered chunks,
   * then forwards any new chunks from the source as they arrive.
   *
   * Buffered chunks are delivered via _read() (pull-based) rather than pushed
   * eagerly. This is critical because createReplayStream() is called outside
   * of AsyncLocalStorage context, and eagerly pushing chunks triggers internal
   * Node.js stream scheduling (process.nextTick for maybeReadMore) that
   * captures the empty ALS context. By deferring to _read(), chunks are only
   * delivered when the consumer reads, which happens inside the correct ALS
   * scope (e.g. during Fizz's performWork).
   */
  createReplayStream(): Readable {
    if (this._chunks === null) {
      throw new InvariantError(
        'Cannot create a replay stream after the ReplayableNodeStream has been disposed.'
      )
    }

    let ReadableCtor: typeof import('node:stream').Readable
    if (process.env.NEXT_RUNTIME === 'edge') {
      throw new InvariantError(
        'Node.js Readable cannot be teed in the edge runtime'
      )
    } else {
      if (
        process.env.__NEXT_BUNDLER === 'Webpack' ||
        process.env.__NEXT_BUNDLER === 'Rspack'
      ) {
        ReadableCtor = (
          __non_webpack_require__('node:stream') as typeof import('node:stream')
        ).Readable
      } else {
        ReadableCtor = (require('node:stream') as typeof import('node:stream'))
          .Readable
      }
    }

    const bufferedChunks = this._chunks.slice()
    let bufferIndex = 0
    let bufferDrained = false
    const isDone = this._done
    const sourceError = this._error

    const stream = new ReadableCtor({
      read() {
        if (!bufferDrained) {
          bufferDrained = true
          for (let i = bufferIndex; i < bufferedChunks.length; i++) {
            this.push(bufferedChunks[i])
          }
          bufferIndex = bufferedChunks.length
          if (isDone) {
            this.push(null)
          }
        }
      },
    })

    if (sourceError) {
      stream.destroy(sourceError)
      return stream
    }

    if (isDone) {
      return stream
    }

    const subscriber: ReplayableStreamSubscriber = {
      onChunk: (chunk) => {
        stream.push(chunk)
      },
      onEnd: () => {
        stream.push(null)
      },
      onError: (err) => {
        stream.destroy(err)
      },
    }
    this._subscribers.add(subscriber)

    stream.on('close', () => {
      this._subscribers.delete(subscriber)
    })

    return stream
  }

  /**
   * Clears the buffered chunks and all subscriber references. After calling
   * this, no new replay streams can be created.
   */
  dispose(): void {
    this._chunks = null
  }
}

export function createTrackedStream<T extends AnyStream>(
  createStream: () => T,
  onComplete: OnStreamComplete
): T
export function createTrackedStream<T extends AnyStream>(
  createStream: () => Promise<T>,
  onComplete: OnStreamComplete
): Promise<T>
export function createTrackedStream<T extends AnyStream>(
  createStream: () => T | Promise<T>,
  onComplete: OnStreamComplete
): T | Promise<T>
export function createTrackedStream<T extends AnyStream>(
  createStream: () => T | Promise<T>,
  onComplete: OnStreamComplete
): T | Promise<T> {
  let stream: T | Promise<T>
  try {
    stream = createStream()
  } catch (error) {
    onComplete({ error })
    throw error
  }

  if (isThenable(stream)) {
    return stream.then(
      (resolvedStream) => trackStreamCompletion(resolvedStream, onComplete),
      (error) => {
        onComplete({ error })
        throw error
      }
    )
  }

  return trackStreamCompletion(stream, onComplete)
}

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === 'function'
}

function trackStreamCompletion<T extends AnyStream>(
  stream: T,
  onComplete: OnStreamComplete
): T {
  if (isWebStream(stream)) {
    return trackWebStreamCompletion(stream, onComplete) as T
  }

  trackNodeStreamCompletion(stream, onComplete)
  return stream
}

function trackNodeStreamCompletion(
  stream: Readable,
  onComplete: OnStreamComplete
): void {
  const complete = createOneShotCompletion(onComplete)

  stream.on('end', () => complete())
  stream.on('error', (error) => complete({ error }))
  stream.on('close', () => {
    if (!stream.readableEnded && !stream.errored) {
      complete({ error: createPrematureStreamCloseError('RSC') })
    }
  })
}

/**
 * Ends the render phase when the RSC source stream finishes producing without
 * eagerly reading from the stream or adding another buffer.
 */
export function trackWebStreamCompletion(
  stream: ReadableStream<Uint8Array>,
  onComplete: OnStreamComplete
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  const complete = createOneShotCompletion(onComplete)

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        let result: ReadableStreamReadResult<Uint8Array>
        try {
          result = await reader.read()
        } catch (error) {
          complete({ error })
          controller.error(error)
          return
        }

        if (result.done) {
          complete()
          controller.close()
        } else {
          controller.enqueue(result.value)
        }
      },
      cancel(reason) {
        complete({ error: createPrematureStreamCloseError('RSC') })
        return reader.cancel(reason)
      },
    },
    { highWaterMark: 0 }
  )
}

function createOneShotCompletion(
  onComplete: OnStreamComplete
): OnStreamComplete {
  let isComplete = false
  return (completion) => {
    if (isComplete) {
      return
    }
    isComplete = true
    if (completion) {
      onComplete(completion)
    } else {
      onComplete()
    }
  }
}

function createPrematureStreamCloseError(streamName: string): Error {
  const error = new Error(`${streamName} stream closed before completion`)
  error.name = 'AbortError'
  return error
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
  underlying: AnyStream
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
    for await (const chunk of underlying) {
      chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
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

  asChunks(): Array<Uint8Array> {
    const chunks = this.assertChunks('asChunks()')
    return chunks
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
