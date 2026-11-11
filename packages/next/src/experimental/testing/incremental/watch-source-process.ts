import { runTestProcess } from '../execution/process'
import type {
  FileChange,
  TestWatchSource,
  WatchDirectories,
} from './watch-files'
import { createWatchSourceErrorDecoder } from './watch-source-errors'
import {
  snapshotWatchDirectories,
  type WatchSourceRequest,
  type WatchSourceResponse,
} from './watch-source-protocol'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  void promise.catch(() => {})
  return { promise, resolve, reject }
}
function combined(errors: unknown[], message: string): unknown {
  return errors.length === 1 ? errors[0] : new AggregateError(errors, message)
}

/** The input engine is read-only; physical process exit owns all its threads. */
export async function createOwnedWatchSource(
  options: WatchDirectories & {
    signal?: AbortSignal
    onChange(change: FileChange): void
    onError(error: unknown): void
  }
): Promise<TestWatchSource> {
  const signal =
    options.signal ??
    (() => {
      throw new Error('Owned input source requires its cancellation signal.')
    })()
  signal.throwIfAborted()
  const input = snapshotWatchDirectories(options)
  const onChange = options.onChange,
    onError = options.onError
  const controller = new AbortController()
  const decode = createWatchSourceErrorDecoder()
  const pending = new Map<
    number,
    { kind: 'open' | 'update'; done: ReturnType<typeof deferred<void>> }
  >()
  const ready = deferred<void>()
  pending.set(1, { kind: 'open', done: ready })
  const occurrences = new Set<number>()
  const startupErrors: unknown[] = []
  const callbackErrors: unknown[] = []
  const cleanupErrors: unknown[] = []
  let nextId = 1
  let sourceReady = false
  let deliveringChanges = false
  const earlyChanges: FileChange[] = []
  let closing = false
  let physicallyClosed = false
  let closeReason: unknown
  let closeWork: Promise<void> | undefined
  let send: ((request: WatchSourceRequest) => Promise<void>) | undefined
  let updates = Promise.resolve()
  const rejectPending = (error: unknown) => {
    for (const request of pending.values()) request.done.reject(error)
    pending.clear()
  }
  const stop = (reason: unknown) => {
    if (closing) return
    closing = true
    closeReason = reason
    rejectPending(reason)
    controller.abort(reason)
  }
  const fail = (error: unknown) => {
    if (!sourceReady) startupErrors.push(error)
    else {
      try {
        onError(error)
      } catch (callbackError) {
        callbackErrors.push(error, callbackError)
      }
    }
    stop(error)
  }
  const abort = () => stop(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const processExit = runTestProcess(require.resolve('./watch-source-worker'), {
    cwd: process.cwd(),
    env: process.env,
    input: {
      type: 'watch-source-open',
      id: 1,
      directories: input,
    } satisfies WatchSourceRequest,
    signal: controller.signal,
    onReady(transport) {
      send = transport
    },
    onOutput(stream, chunk) {
      ;(stream === 'stdout' ? process.stdout : process.stderr).write(chunk)
    },
    onMessage(value) {
      try {
        if (!value || typeof value !== 'object')
          throw new Error('Invalid input source response.')
        const message = value as WatchSourceResponse
        if (
          message.type === 'watch-source-ready' ||
          message.type === 'watch-source-updated'
        ) {
          if (closing) return
          const request = pending.get(message.id)
          if (
            !request ||
            (message.type === 'watch-source-ready') !==
              (request.kind === 'open')
          )
            throw new Error('Unrequested input source completion.')
          pending.delete(message.id)
          if (request.kind === 'open') {
            sourceReady = true
            setImmediate(() => {
              deliveringChanges = true
              if (closing) {
                earlyChanges.length = 0
                return
              }
              try {
                for (const change of earlyChanges.splice(0)) onChange(change)
              } catch (error) {
                fail(error)
              }
            })
          }
          request.done.resolve()
        } else if (message.type === 'watch-source-change') {
          if (closing) return
          if (
            !Array.isArray(message.change?.changed) ||
            !Array.isArray(message.change.removed) ||
            [...message.change.changed, ...message.change.removed].some(
              (file) => typeof file !== 'string'
            )
          )
            throw new Error('Invalid input source change.')
          if (!deliveringChanges) earlyChanges.push(message.change)
          else onChange(message.change)
        } else if (message.type === 'watch-source-error') {
          if (occurrences.has(message.failure.occurrence)) return
          occurrences.add(message.failure.occurrence)
          fail(decode(message.failure.error))
        } else if (message.type === 'watch-source-operation-failed') {
          const request = pending.get(message.id)
          if (request) {
            pending.delete(message.id)
            request.done.reject(decode(message.error))
          }
          if (!closing) fail(decode(message.error))
        } else if (message.type !== 'watch-source-closed')
          throw new Error('Invalid input source response type.')
      } catch (error) {
        fail(error)
      }
    },
  }).then(
    (exit) => {
      physicallyClosed = true
      if (!closing)
        fail(
          new Error(
            `Input source exited unexpectedly (${exit.signal ?? exit.code}).`
          )
        )
      rejectPending(closeReason ?? new Error('Input source closed.'))
      return exit
    },
    (error) => {
      physicallyClosed = true
      cleanupErrors.push(error)
      if (!closing) fail(error)
      rejectPending(closeReason ?? error)
      throw error
    }
  )
  void processExit.catch(() => {})
  async function close(): Promise<void> {
    if (closeWork) return closeWork
    stop(new Error('Input source closed.'))
    closeWork = (async () => {
      try {
        await processExit
      } catch {
        /* retained below, after the actual process join */
      }
      signal.removeEventListener('abort', abort)
      if (!physicallyClosed)
        throw new Error('Input source did not join its process.')
      const errors = [...callbackErrors, ...cleanupErrors]
      if (errors.length)
        throw combined(errors, 'Input source callback and cleanup failed.')
    })()
    return closeWork
  }
  try {
    await ready.promise
  } catch (error) {
    const errors = startupErrors.length ? [...startupErrors] : [error]
    try {
      await close()
    } catch (cleanupError) {
      errors.push(cleanupError)
    }
    throw combined(errors, 'Input source startup and cleanup failed.')
  }
  return {
    close,
    update(next) {
      const directories = snapshotWatchDirectories(next)
      if (closing) return Promise.reject(closeReason)
      const id = ++nextId,
        done = deferred<void>()
      pending.set(id, { kind: 'update', done })
      updates = updates
        .then(async () => {
          if (closing) {
            done.reject(closeReason)
            return
          }
          if (!send)
            throw new Error('Input source transport was not initialized.')
          void send({ type: 'watch-source-update', id, directories }).catch(
            (error) => {
              if (!closing) fail(error)
            }
          )
          await done.promise
        })
        .catch((error) => {
          if (!closing) fail(error)
        })
      return done.promise
    },
  }
}
