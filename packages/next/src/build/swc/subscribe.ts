/**
 * Calls a native function and streams the result.
 * If useBuffer is true, all values will be preserved, potentially buffered
 * if consumed slower than produced. Else, only the latest value will be
 * preserved.
 *
 * The returned iterator's `return()` (invoked directly or by `for await`)
 * always drives the generator through its `finally` block so the native
 * subscription task is disposed deterministically.
 */
export function subscribe<T>(
  useBuffer: boolean,
  nativeFunction: (
    callback: (err: Error, value: T) => void
  ) => Promise<unknown>,
  disposeTask: (task: unknown) => unknown
): AsyncIterableIterator<T> {
  type BufferItem =
    | { err: Error; value: undefined }
    | { err: undefined; value: T }

  const cancel = new (class Cancel extends Error {})()

  // A buffer of produced items. This will only contain values if the
  // consumer is slower than the producer.
  let buffer: BufferItem[] = []
  // A deferred value waiting for the next produced item. This will only
  // exist if the consumer is faster than the producer.
  let waiting:
    | {
        resolve: (value: T) => void
        reject: (error: Error) => void
      }
    | undefined
  let canceled = false

  // The native function will call this every time it emits a new result. We
  // either need to notify a waiting consumer, or buffer the new result until
  // the consumer catches up. Once the consumer has canceled, late emissions
  // are dropped instead of accumulating in a buffer nobody will read.
  function emitResult(err: Error | undefined, value: T | undefined) {
    if (canceled) {
      return
    }
    if (waiting) {
      let { resolve, reject } = waiting
      waiting = undefined
      if (err) reject(err)
      else resolve(value!)
    } else {
      const item = { err, value } as BufferItem
      if (useBuffer) buffer.push(item)
      else buffer[0] = item
    }
  }

  async function* createIterator() {
    const task = await nativeFunction(emitResult)
    try {
      while (!canceled) {
        if (buffer.length > 0) {
          const item = buffer.shift()!
          if (item.err) throw item.err
          yield item.value
        } else {
          // eslint-disable-next-line no-loop-func
          yield new Promise<T>((resolve, reject) => {
            waiting = { resolve, reject }
          })
        }
      }
    } catch (e) {
      if (e === cancel) return
      throw e
    } finally {
      if (task) {
        disposeTask(task)
      }
    }
  }

  const iterator = createIterator()
  const generatorReturn = iterator.return!.bind(iterator)
  iterator.return = async () => {
    canceled = true
    // Reject the pending idle wait first so a generator suspended at that
    // yield resumes and reaches its `finally`. Then drive the generator to
    // completion in every other suspension state (e.g. suspended after
    // yielding a value): the previous override never resumed the generator,
    // so its `finally` — the only place the native root task is disposed —
    // never ran and the native subscription leaked.
    if (waiting) waiting.reject(cancel)
    try {
      await generatorReturn()
    } catch {
      // Teardown errors are not actionable for a consumer that is leaving.
    }
    return { value: undefined, done: true } as IteratorReturnResult<never>
  }
  return iterator
}
