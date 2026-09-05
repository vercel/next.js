type NativeSubscriptionFunction<T, TTask> = (
  callback: (error: Error | undefined, value: T | undefined) => void
) => Promise<TTask | void>

type DisposeTask<TTask> = (task: TTask) => void | Promise<void>

function isDefined<T>(value: T | void): value is T {
  return value !== undefined
}

/**
 * Maps a subscription without an async-generator wrapper. A generator waiting
 * in `source.next()` queues `return()` behind that read, so it cannot cancel an
 * idle native subscription.
 */
export function mapTurbopackSubscription<TInput, TOutput>(
  source: AsyncIterableIterator<TInput>,
  map: (value: TInput) => TOutput
): AsyncIterableIterator<TOutput> {
  let closed = false
  let sourceClose: Promise<IteratorResult<TInput>> | undefined

  function closeSource(value?: unknown): Promise<IteratorResult<TInput>> {
    if (sourceClose) return sourceClose

    closed = true
    let resolveClose!: (result: IteratorResult<TInput>) => void
    let rejectClose!: (error: unknown) => void
    sourceClose = new Promise<IteratorResult<TInput>>((resolve, reject) => {
      resolveClose = resolve
      rejectClose = reject
    })

    // Publish the shared close promise before invoking the source. A custom
    // iterator may re-enter this wrapper synchronously from return().
    try {
      if (source.return) {
        void Promise.resolve(source.return(value)).then(
          resolveClose,
          rejectClose
        )
      } else {
        resolveClose({ done: true, value: undefined })
      }
    } catch (error) {
      rejectClose(error)
    }
    return sourceClose
  }

  async function mapResult(
    result: IteratorResult<TInput>
  ): Promise<IteratorResult<TOutput>> {
    if (result.done) {
      closed = true
      return result as IteratorReturnResult<TOutput>
    }

    try {
      return { done: false, value: map(result.value) }
    } catch (mappingError) {
      // AsyncIteratorClose preserves the abrupt completion. Await disposal so
      // it cannot leak, but keep the mapping failure primary.
      try {
        await closeSource()
      } catch {}
      throw mappingError
    }
  }

  const mapped: AsyncIterableIterator<TOutput> = {
    async next() {
      if (closed) return { done: true, value: undefined }
      const result = await source.next()
      if (closed && !result.done) return { done: true, value: undefined }
      return mapResult(result)
    },
    async return(value) {
      const result = await closeSource(value)
      return result.done
        ? ({ done: true, value } as IteratorReturnResult<TOutput>)
        : mapResult(result)
    },
    async throw(error) {
      if (closed) throw error
      if (source.throw) return mapResult(await source.throw(error))

      try {
        await closeSource()
      } catch {}
      throw error
    },
    [Symbol.asyncIterator]() {
      return mapped
    },
  }

  return mapped
}

/**
 * Adapts a native callback subscription to an owned async iterator. Calling
 * `return()` wakes an idle `next()`, ignores later callbacks, disposes the root
 * task exactly once, and does not settle until asynchronous disposal finishes.
 */
export function createTurbopackSubscription<T, TTask>(
  useBuffer: boolean,
  nativeFunction: NativeSubscriptionFunction<T, TTask>,
  disposeTask: DisposeTask<TTask>
): AsyncIterableIterator<T> {
  type BufferItem =
    | { error: Error; value: undefined }
    | { error: undefined; value: T }
  type Finalization = { success: true } | { success: false; error: unknown }

  const buffer: BufferItem[] = []
  const cancellation = new (class SubscriptionCanceled extends Error {})()
  let waiting:
    | {
        resolve(value: T): void
        reject(error: Error): void
      }
    | undefined
  let canceled = false
  let generatorStarted = false
  let finalizationSettled = false
  let settleFinalization!: (result: Finalization) => void
  const finalization = new Promise<Finalization>((resolve) => {
    settleFinalization = resolve
  })

  function settleOnce(result: Finalization): void {
    if (finalizationSettled) return
    finalizationSettled = true
    settleFinalization(result)
  }

  function emitResult(error: Error | undefined, value: T | undefined): void {
    if (canceled) return

    if (waiting) {
      const pending = waiting
      waiting = undefined
      if (error) pending.reject(error)
      else pending.resolve(value!)
      return
    }

    const item = { error, value } as BufferItem
    if (useBuffer) buffer.push(item)
    else buffer[0] = item
  }

  async function* createIterator() {
    generatorStarted = true
    let task: TTask | void = undefined
    let primaryError: unknown
    let hasPrimaryError = false
    try {
      task = await nativeFunction(emitResult)
      while (!canceled) {
        if (buffer.length > 0) {
          const item = buffer.shift()!
          if (item.error) throw item.error
          yield item.value
        } else {
          // eslint-disable-next-line no-loop-func
          yield new Promise<T>((resolve, reject) => {
            waiting = { resolve, reject }
          })
        }
      }
    } catch (error) {
      if (error === cancellation) return
      primaryError = error
      hasPrimaryError = true
      throw error
    } finally {
      try {
        if (isDefined(task)) await disposeTask(task)
        settleOnce({ success: true })
      } catch (disposalError) {
        const finalError = hasPrimaryError
          ? new AggregateError(
              [primaryError, disposalError],
              'Turbopack subscription and disposal both failed'
            )
          : disposalError
        settleOnce({ success: false, error: finalError })
        throw finalError
      }
    }
  }

  const iterator = createIterator()
  const originalReturn = iterator.return.bind(iterator)
  let returnPromise: Promise<IteratorResult<T>> | undefined

  iterator.return = ((value?: unknown) => {
    if (returnPromise) return returnPromise

    canceled = true
    buffer.length = 0
    const pending = waiting
    waiting = undefined
    pending?.reject(cancellation)

    returnPromise = (async () => {
      let result: IteratorResult<T>
      let returnError: unknown
      try {
        result = await originalReturn(value as never)
      } catch (error) {
        returnError = error
        result = { done: true, value: undefined }
      }

      // Returning a generator before its first next() never enters its body or
      // finally block. Native startup cannot begin afterward, so no task exists.
      if (!generatorStarted) settleOnce({ success: true })

      const finalized = await finalization
      if (returnError !== undefined) throw returnError
      if (finalized.success === false) throw finalized.error
      return result
    })()
    return returnPromise
  }) as typeof iterator.return

  return iterator
}
