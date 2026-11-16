import { AsyncResource, executionAsyncId } from 'node:async_hooks'

/**
 * Consumes a long-lived async iterable (e.g. a Turbopack subscription) like a
 * `for await` loop, calling `callback` for each value, and waiting for it if it
 * returns a promise:
 *
 * - Returning (`undefined`) from `callback` acts like `continue`.
 * - Returning `false` from `callback` acts like `break`: the iterator is closed
 *   (`return()`), and the returned promise resolves once that's done.
 * - Like in a `for await` loop, the returned promise rejects when the iterator
 *   throws. When `callback` throws, the iterator is closed first, and the
 *   callback's error takes precedence over errors from closing the iterator.
 *
 * Unlike a `for await` loop, each iteration runs in its own async context. The
 * async context of an iteration is triggered by the async context in which the
 * loop was started, instead of by the previous iteration. So the async
 * ancestry of an iteration doesn't grow with every iteration.
 *
 * This matters for tools that track async ancestry. Most notably, React's
 * async debug info tracking (in development builds of React Server Components)
 * records every promise along with what it awaited and what ran before it. In
 * a `for await` loop that runs for the lifetime of the dev server, every
 * iteration is linked to the previous one, so that information would grow
 * without bounds, and could never be garbage collected.
 *
 * AsyncLocalStorage stores are propagated as usual.
 */
export function forEachInFreshAsyncContext<T>(
  iterable: AsyncIterable<T>,
  callback: (value: T) => void | false | Promise<void | false>
): Promise<void> {
  let iterator: AsyncIterator<T>

  try {
    iterator = iterable[Symbol.asyncIterator]()
  } catch (error) {
    return Promise.reject(error)
  }

  // Each iteration's async context is triggered by the async context in which
  // the loop was started, so all iterations are siblings instead of a chain.
  const triggerAsyncId = executionAsyncId()

  return new Promise<void>((resolve, reject) => {
    const closeIterator = (): Promise<unknown> => {
      try {
        return Promise.resolve(iterator.return?.())
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const closeIteratorAndReject = (error: unknown) => {
      closeIterator().then(
        () => reject(error),
        () => reject(error)
      )
    }

    const iterate = () => {
      const resource = new AsyncResource('NextSubscriptionIteration', {
        triggerAsyncId,
        requireManualDestroy: true,
      })

      let isDestroyed = false

      const destroy = () => {
        if (!isDestroyed) {
          isDestroyed = true
          resource.emitDestroy()
        }
      }

      const handleResult = (result: IteratorResult<T>) => {
        let done: boolean | undefined
        let value: T

        try {
          if (Object(result) !== result) {
            throw new TypeError(`Iterator result ${result} is not an object`)
          }
          done = result.done
          value = result.value
        } catch (error) {
          destroy()
          reject(error)
          return
        }

        if (done) {
          destroy()
          resolve()
          return
        }

        let handled: Promise<void | false>

        try {
          handled = Promise.resolve(callback(value))
        } catch (error) {
          destroy()
          closeIteratorAndReject(error)
          return
        }

        handled.then(
          (outcome) => {
            destroy()
            if (outcome === false) {
              closeIterator().then(() => resolve(), reject)
            } else {
              iterate()
            }
          },
          (error) => {
            destroy()
            closeIteratorAndReject(error)
          }
        )
      }

      resource.runInAsyncScope(() => {
        let next: Promise<IteratorResult<T>>

        try {
          next = Promise.resolve(iterator.next())
        } catch (error) {
          destroy()
          reject(error)
          return
        }

        next.then(handleResult, (error) => {
          destroy()
          reject(error)
        })
      })
    }

    iterate()
  })
}
