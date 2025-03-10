import { InvariantError } from '../../shared/lib/invariant-error'
import { isPrerenderInterruptedError } from './dynamic-rendering'

/**
 * This is a utility function to make scheduling sequential tasks that run back to back easier.
 * We schedule on the same queue (setImmediate) at the same time to ensure no other events can sneak in between.
 */
export function prerenderAndAbortInSequentialTasks<R>(
  prerender: () => Promise<R>,
  abort: () => void
): Promise<R> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`prerenderAndAbortInSequentialTasks` should not be called in edge runtime.'
    )
  } else {
    return new Promise((resolve, reject) => {
      let pendingResult: Promise<R>
      setImmediate(() => {
        try {
          pendingResult = prerender()
          pendingResult.catch(() => {})
        } catch (err) {
          reject(err)
        }
      })
      setImmediate(() => {
        abort()
        resolve(pendingResult)
      })
    })
  }
}

export function prerenderServerWithPhases(
  signal: AbortSignal,
  render: () => ReadableStream<Uint8Array>,
  finalPhase: () => void
): Promise<ServerPrerenderStreamResult>
export function prerenderServerWithPhases(
  signal: AbortSignal,
  render: () => ReadableStream<Uint8Array>,
  secondPhase: () => void,
  finalPhase: () => void
): Promise<ServerPrerenderStreamResult>
export function prerenderServerWithPhases(
  signal: AbortSignal,
  render: () => ReadableStream<Uint8Array>,
  secondPhase: () => void,
  thirdPhase: () => void,
  ...remainingPhases: Array<() => void>
): Promise<ServerPrerenderStreamResult>
export function prerenderServerWithPhases(
  signal: AbortSignal,
  render: () => ReadableStream<Uint8Array>,
  ...remainingPhases: Array<() => void>
): Promise<ServerPrerenderStreamResult> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`prerenderAndAbortInSequentialTasks` should not be called in edge runtime.'
    )
  } else {
    return new Promise((resolve, reject) => {
      let result: ServerPrerenderStreamResult

      signal.addEventListener(
        'abort',
        () => {
          if (isPrerenderInterruptedError(signal.reason)) {
            result.markInterrupted()
          } else {
            result.markComplete()
          }
        },
        {
          once: true,
        }
      )

      setImmediate(() => {
        try {
          result = new ServerPrerenderStreamResult(render())
        } catch (err) {
          reject(err)
        }
      })

      function runFinalTask(this: () => void) {
        try {
          if (result) {
            result.markComplete()
            this()
          }
          resolve(result)
        } catch (err) {
          reject(err)
        }
      }

      function runNextTask(this: () => void) {
        try {
          if (result) {
            result.markPhase()
            this()
          }
        } catch (err) {
          reject(err)
        }
      }

      let i = 0
      for (; i < remainingPhases.length - 1; i++) {
        const phase = remainingPhases[i]
        setImmediate(runNextTask.bind(phase))
      }
      if (remainingPhases[i]) {
        const finalPhase = remainingPhases[i]
        setImmediate(runFinalTask.bind(finalPhase))
      }
    })
  }
}

const PENDING = 0
const COMPLETE = 1
const INTERRUPTED = 2
const ERRORED = 3

export class ServerPrerenderStreamResult {
  private currentChunks: Array<Uint8Array>
  private chunksByPhase: Array<Array<Uint8Array>>
  private trailingChunks: Array<Uint8Array>
  private status: 0 | 1 | 2 | 3
  private reason: null | unknown

  constructor(stream: ReadableStream<Uint8Array>) {
    this.status = PENDING
    this.reason = null

    this.trailingChunks = []
    this.currentChunks = []
    this.chunksByPhase = [this.currentChunks]

    const reader = stream.getReader()

    const progress = ({
      done,
      value,
    }: ReadableStreamReadResult<Uint8Array>) => {
      if (done) {
        if (this.status === PENDING) {
          this.status = COMPLETE
        }
        return
      }
      if (this.status === PENDING || this.status === INTERRUPTED) {
        this.currentChunks.push(value)
      } else {
        this.trailingChunks.push(value)
      }
      reader.read().then(progress, error)
    }
    const error = (reason: unknown) => {
      this.status = ERRORED
      this.reason = reason
    }

    reader.read().then(progress, error)
  }

  markPhase() {
    this.currentChunks = []
    this.chunksByPhase.push(this.currentChunks)
  }

  markComplete() {
    if (this.status === PENDING) {
      this.status = COMPLETE
    }
  }

  markInterrupted() {
    this.status = INTERRUPTED
  }

  /**
   * Returns a stream which only releases chunks when `releasePhase` is called. This stream will never "complete" because
   * we rely upon the stream remaining open when prerendering to avoid triggering errors for incomplete chunks in the client.
   *
   * asPhasedStream is expected to be called once per result however it is safe to call multiple times as long as we have not
   * transferred the underlying data. Generally this will only happen when streaming to a response
   */
  asPhasedStream() {
    switch (this.status) {
      case COMPLETE:
      case INTERRUPTED:
        return new PhasedStream(this.chunksByPhase)
      default:
        throw new InvariantError(
          `ServerPrerenderStreamResult cannot be consumed as a stream because it is not yet complete. status: ${this.status}`
        )
    }
  }

  /**
   * Returns a stream which will release all chunks immediately. This stream will "complete" synchronously. It should be used outside
   * of render use cases like loading client chunks ahead of SSR or writing the streamed content to disk.
   */
  asStream() {
    switch (this.status) {
      case COMPLETE:
      case INTERRUPTED:
        const chunksByPhase = this.chunksByPhase
        const trailingChunks = this.trailingChunks
        return new ReadableStream({
          start(controller) {
            for (let i = 0; i < chunksByPhase.length; i++) {
              const chunks = chunksByPhase[i]
              for (let j = 0; j < chunks.length; j++) {
                controller.enqueue(chunks[j])
              }
            }
            for (let i = 0; i < trailingChunks.length; i++) {
              controller.enqueue(trailingChunks[i])
            }
            controller.close()
          },
        })
      default:
        throw new InvariantError(
          `ServerPrerenderStreamResult cannot be consumed as a stream because it is not yet complete. status: ${this.status}`
        )
    }
  }
}

class PhasedStream<T> extends ReadableStream<T> {
  private nextPhase: number
  private chunksByPhase: Array<Array<T>>
  private destination: ReadableStreamDefaultController<T>

  constructor(chunksByPhase: Array<Array<T>>) {
    if (chunksByPhase.length === 0) {
      throw new InvariantError(
        'PhasedStream expected at least one phase but none were found.'
      )
    }

    let destination: ReadableStreamDefaultController<T>
    super({
      start(controller) {
        destination = controller
      },
    })

    // the start function above is called synchronously during construction so we will always have a destination
    // We wait to assign it until after the super call because we cannot access `this` before calling super
    this.destination = destination!
    this.nextPhase = 0
    this.chunksByPhase = chunksByPhase
    this.releasePhase()
  }

  releasePhase() {
    if (this.nextPhase < this.chunksByPhase.length) {
      const chunks = this.chunksByPhase[this.nextPhase++]
      for (let i = 0; i < chunks.length; i++) {
        this.destination.enqueue(chunks[i])
      }
    } else {
      throw new InvariantError(
        'PhasedStream expected more phases to release but none were found.'
      )
    }
  }

  assertExhausted() {
    if (this.nextPhase < this.chunksByPhase.length) {
      throw new InvariantError(
        'PhasedStream expected no more phases to release but some were found.'
      )
    }
  }
}

export function prerenderClientWithPhases<T>(
  render: () => Promise<T>,
  finalPhase: () => void
): Promise<T>
export function prerenderClientWithPhases<T>(
  render: () => Promise<T>,
  secondPhase: () => void,
  finalPhase: () => void
): Promise<T>
export function prerenderClientWithPhases<T>(
  render: () => Promise<T>,
  secondPhase: () => void,
  thirdPhase: () => void,
  ...remainingPhases: Array<() => void>
): Promise<T>
export function prerenderClientWithPhases<T>(
  render: () => Promise<T>,
  ...remainingPhases: Array<() => void>
): Promise<T> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`prerenderAndAbortInSequentialTasks` should not be called in edge runtime.'
    )
  } else {
    return new Promise((resolve, reject) => {
      let pendingResult: Promise<T>
      setImmediate(() => {
        try {
          pendingResult = render()
          pendingResult.catch((err) => reject(err))
        } catch (err) {
          reject(err)
        }
      })

      function runFinalTask(this: () => void) {
        try {
          this()
          resolve(pendingResult)
        } catch (err) {
          reject(err)
        }
      }

      function runNextTask(this: () => void) {
        try {
          this()
        } catch (err) {
          reject(err)
        }
      }

      let i = 0
      for (; i < remainingPhases.length - 1; i++) {
        const phase = remainingPhases[i]
        setImmediate(runNextTask.bind(phase))
      }
      if (remainingPhases[i]) {
        const finalPhase = remainingPhases[i]
        setImmediate(runFinalTask.bind(finalPhase))
      }
    })
  }
}

// React's RSC prerender function will emit an incomplete flight stream when using `prerender`. If the connection
// closes then whatever hanging chunks exist will be errored. This is because prerender (an experimental feature)
// has not yet implemented a concept of resume. For now we will simulate a paused connection by wrapping the stream
// in one that doesn't close even when the underlying is complete.
export class ReactServerResult {
  private _stream: null | ReadableStream<Uint8Array>

  constructor(stream: ReadableStream<Uint8Array>) {
    this._stream = stream
  }

  tee() {
    if (this._stream === null) {
      throw new Error(
        'Cannot tee a ReactServerResult that has already been consumed'
      )
    }
    const tee = this._stream.tee()
    this._stream = tee[0]
    return tee[1]
  }

  consume() {
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
  underlying: ReadableStream<Uint8Array>
): Promise<ReactServerPrerenderResult> {
  const chunks: Array<Uint8Array> = []
  const reader = underlying.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    } else {
      chunks.push(value)
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
